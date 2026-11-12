from copy import deepcopy
import re
from fastapi import APIRouter, Body, Request
from .core import clean_document, fail, id_filter, number, require, respond, semester, text, utcnow
from .services.enrollment import (ARRAY_FIELDS, BOOL_FIELDS, active_records, applicant_identifier, batch,
    applicant_only_record, digits, find_applicant, identifiers_match, mark_advised, normalize_student,
    person_name, plan_enrollment, save_enrollment)
from .services.sections import (SectionGroups, add_student, persist_plan, section_name,
                                sync_all, sync_student_changes)
from .services.archives import archive_schedules, find_classes
from .services.pdf import cor_pdf
from starlette.responses import Response

router = APIRouter(prefix='/api/students', tags=['Students'])


@router.get('')
@router.get('/', include_in_schema=False)
def list_students(request: Request):
    store, params = request.app.state.store, request.query_params
    query = {'$and': [{'status': {'$ne': 'Advised'}}]}
    for field in ['status', 'year', 'section', 'semester']:
        value = params.get(field)
        if value and value not in {'All', 'All students'}:
            clause = {field: value}
            if field == 'year' and value.isdigit():
                clause = {'year': {'$in': [value, int(value)]}}
            query['$and'].append(clause)
    with store.write():
        mark_advised(store)
        students = list(store['students'].find(query).sort('createdAt', -1))
        schedules = list(store['schedules'].find({}).sort([('generated_at', -1), ('createdAt', -1)]))
        archive_schedules(store, students, schedules)
    return respond(students)


@router.get('/pending')
def pending(request: Request):
    store = request.app.state.store
    validations = {text(v.get('applicant_number')): v.get('status', 'Pending') for v in store['validation'].find({})}
    result = []
    for applicant in store['applicants'].find({'applicantId': {'$exists': True, '$ne': None}}):
        identifier = text(applicant['applicantId'])
        status = validations.get(identifier, 'Pending')
        if not text(status) or 'pending' in text(status).lower():
            result.append({'applicant_number': identifier, 'applicant_name': person_name(applicant), 'status': status})
    return respond(result)


@router.get('/applicants')
def applicants(request: Request):
    store = request.app.state.store
    records = active_records(store)
    result, matched = [], set()
    def candidate(person, record, existing=False):
        return {'applicantID': text(record.get('applicantID')) if existing else applicant_identifier(person),
                **({'studentNumber': person['studentNumber']} if existing else {}),
                'applicant_name': person_name(person), 'status': text(record.get('status', person.get('status'))),
                'year': text(record.get('year')), 'section': text(record.get('section')), 'semester': text(record.get('semester')),
                'isIrregular': text(record.get('status')).lower() == 'irregular', 'isAdvisingRecord': True}
    for applicant in store['applicants'].find({}):
        record = next((r for r in records if identifiers_match(r.get('applicantID'), applicant_identifier(applicant))), None)
        if record:
            matched.add(record['_id'])
            result.append(candidate(applicant, record))
    for student in store['students'].find({}):
        # Skip advising records with "A-" in applicantID — those only match applicants, not students
        record = next((r for r in records
                       if not applicant_only_record(r)
                       and 'A-' not in text(r.get('applicantID', ''))
                       and digits(r.get('applicantID')) == digits(student.get('studentNumber'))
                       and digits(student.get('studentNumber'))), None)
        if record and record['_id'] not in matched:
            matched.add(record['_id'])
            result.append(candidate(student, record, True))
    return respond(result)


@router.get('/sections')
def sections(request: Request):
    return respond(sorted({text(s) for s in request.app.state.store['students'].distinct('section') if text(s)}))


@router.get('/section/{section}')
def students_by_section(section: str, request: Request):
    query = {'section': section_name(section)}
    for field in ['year', 'semester']:
        if request.query_params.get(field):
            query[field] = request.query_params[field]
    return respond(list(request.app.state.store['students'].find(query)))


@router.post('/batch-enroll-preview')
def preview(request: Request, body: dict = Body(...)):
    store = request.app.state.store
    with store.lock:
        return respond(batch(store, clean_document(body), preview=True))


@router.post('/batch-enroll')
def batch_enroll(request: Request, body: dict = Body(...)):
    store = request.app.state.store
    with store.write():
        result = batch(store, clean_document(body))
    return respond(result)


@router.post('/enroll')
def enroll(request: Request, body: dict = Body(...)):
    requested = body.get('applicantID')
    require(isinstance(requested, (str, int)) and not isinstance(requested, bool) and bool(text(requested)), 'applicantID is required')
    store = request.app.state.store
    with store.write():
        applicant = find_applicant(store, requested)
        require(applicant is not None, 'Applicant not found', 404)
        student_number = applicant_identifier(applicant) or text(requested)
        if store['students'].find_one({'applicantId': student_number}):
            fail(409, 'Enrollment blocked: Applicant ID already exists', blockReason='student_exists', applicantId=student_number)
        groups = SectionGroups(store)
        found = {'applicant': applicant, 'studentNumber': student_number, 'isAdvisingRecord': False, 'requestedID': requested}
        plan = plan_enrollment(store, found, groups, direct=True)
        if not plan['ok']:
            fail(409, plan['message'], blockReason=plan['reason'])
        student = save_enrollment(store, found, plan, groups)
    return respond({'message': 'Student enrolled successfully', 'student': student})


@router.post('/block-import-preview')
def block_preview(request: Request, body: dict = Body(...)):
    rows = clean_document(body).get('students')
    require(isinstance(rows, list) and bool(rows) and all(isinstance(r, dict) for r in rows), 'students array is required')
    store = request.app.state.store
    result = {'placements': [], 'blocked': []}
    with store.lock:
        groups, seen = SectionGroups(store), set()
        for row in rows:
            aid = text(row.get('applicantID', row.get('applicantId')))
            sn = re.sub(r'^A-?', '', text(row.get('studentNumber')) or aid, flags=re.I)
            common = {'applicantID': aid, 'applicant_name': person_name(row)}
            if not sn:
                result['blocked'].append({**common, 'reason': 'missing_applicant_id'})
            elif sn in seen or store['students'].find_one({'studentNumber': sn}):
                result['blocked'].append({**common, 'studentNumber': sn, 'reason': 'student_exists'})
            else:
                require(text(row.get('year')), f'Student {sn} is missing a year value')
                chosen = groups.choose({'year': row['year'], 'semester': row.get('semester'), 'status': 'Block'})
                add_student(chosen, 'Block')
                seen.add(sn)
                result['placements'].append({**common, 'studentNumber': sn, 'assigned_section': chosen['section'],
                    'assigned_year': chosen['year'], 'assigned_semester': chosen['semester'], 'status': 'Block'})
    return respond(result)


@router.post('/import')
def import_students(request: Request, body: dict = Body(...)):
    body = clean_document(body)
    rows, kind = body.get('students'), text(body.get('importType', 'student')).lower()
    require(isinstance(rows, list) and bool(rows) and all(isinstance(r, dict) for r in rows), 'students array is required')
    require(kind in {'student', 'section', 'block'}, 'importType must be student, section, or block')
    normalized = []
    for raw in rows:
        raw = deepcopy(raw)
        if kind == 'block':
            raw['studentNumber'] = re.sub(r'^A-?', '', text(raw.get('studentNumber')) or text(raw.get('applicantID', raw.get('applicantId'))), flags=re.I)
        student = normalize_student(raw, imported=True)
        if student['studentNumber']:
            if kind == 'block':
                student['status'] = 'Block'
            normalized.append(student)
    require(bool(normalized), 'No valid student rows found')
    store = request.app.state.store
    with store.write():
        existing = {s['studentNumber'] for s in store['students'].find({'studentNumber': {'$in': [s['studentNumber'] for s in normalized]}})}
        seen, blocked, to_import = set(existing), [], []
        for student in normalized:
            require(student['year'], f"Student {student['studentNumber']} is missing a year value")
            if student['studentNumber'] in seen:
                blocked.append({k: student[k] for k in ['studentNumber', 'firstName', 'lastName']})
            else:
                seen.add(student['studentNumber'])
                to_import.append(student)
        if kind == 'student' and blocked:
            fail(409, 'Import Blocked: Student Number Already Exist', blockReason='student_exists', duplicates=blocked)
        if not to_import and blocked:
            fail(409, 'Import Blocked: All students in this section already exist', blockReason='all_students_exist', blocked=blocked)
        groups = SectionGroups(store)
        for student in to_import:
            chosen = groups.choose(student)
            add_student(chosen, student['status'])
            student.update(section=chosen['section'], createdAt=utcnow(), updatedAt=utcnow())
        if to_import:
            store['students'].insert_many(to_import, ordered=True)
            persist_plan(store, groups)
            # Enrolled imported students retain their old status/counter behavior.
            for group in groups.groups.values():
                for state in group:
                    item = {'year': state['year'], 'section': state['section'], 'semester': state['semester']}
                    from .services.sections import section_status
                    store['sections'].update_one(item, {'$set': {'blockCount': state['blockCount'], 'irregularCount': state['irregularCount'],
                        'status': section_status(state['blockCount'], state['irregularCount'], state['totalCapacity'])}})
    return respond({'message': 'Students imported successfully', 'received': len(rows), 'imported': len(to_import),
                    'blocked': blocked, 'upserted': len(to_import), 'modified': 0, 'matched': 0})


@router.post('/move-section')
def move(request: Request, body: dict = Body(...)):
    body = clean_document(body)
    ids, target = body.get('studentIds'), body.get('targetSection')
    require(isinstance(ids, list) and bool(ids) and all(isinstance(i, str) for i in ids) and isinstance(target, dict), 'studentIds and targetSection are required')
    require(len(ids) == len(set(ids)), 'studentIds must not contain duplicates')
    item = {'year': text(target.get('year')), 'section': section_name(target.get('section')), 'semester': semester(target.get('semester'))}
    store = request.app.state.store
    with store.write():
        section = store['sections'].find_one(item)
        require(section is not None, 'Target section not found', 404)
        students = [store['students'].find_one(id_filter(i)) for i in ids]
        require(all(s and text(s.get('year')) == item['year'] and semester(s.get('semester')) == item['semester'] for s in students),
                'Some selected students do not match the target year and semester')
        require(not any(text(s.get('status')).lower() == 'irregular' for s in students),
                'Irregular students must remain in their original section')
        incoming = [s for s in students if section_name(s.get('section')) != item['section']]
        block = sum(s.get('status') != 'Irregular' for s in incoming)
        irregular = len(incoming) - block
        caps = {'blockCapacity': max(number(section.get('blockCapacity')), number(section.get('blockCount')) + block),
                'irregularCapacity': max(number(section.get('irregularCapacity')), number(section.get('irregularCount')) + irregular)}
        caps['totalCapacity'] = max(number(section.get('totalCapacity')), sum(caps.values()))
        store['sections'].update_one({'_id': section['_id']}, {'$set': caps})
        after = []
        for student in students:
            store['students'].update_one({'_id': student['_id']}, {'$set': {'section': item['section'], 'updatedAt': utcnow()}})
            after.append({**student, 'section': item['section']})
        sync_student_changes(store, *students, *after)
        result = store['sections'].find_one(item)
    return respond({'message': 'Students moved successfully', 'section': result})


@router.get('/export-section-pdf')
def export_section(request: Request):
    params, store = request.query_params, request.app.state.store
    year, section, term = params.get('year'), params.get('section'), params.get('semester')
    require(year and section, 'Year and Section are required query parameters')
    query = {'status': {'$ne': 'Pending'}, 'year': text(year), 'section': text(section)}
    if term and term != 'N/A':
        query['semester'] = term
    students = list(store['students'].find(query).sort([('lastName', 1), ('firstName', 1)]))
    require(bool(students), 'No enrolled students found for the specified section', 404)
    return export_pdf(store, students, f"COR_Section_{year}-{section}{'-' + term if term else ''}")


def export_pdf(store, students, filename):
    schedules = list(store['schedules'].find({}).sort([('generated_at', -1), ('createdAt', -1)]))
    with store.write():
        archive_schedules(store, students, schedules)
    pdf = cor_pdf(students, lambda s: find_classes(s, schedules), list(store['subjects'].find({})))
    filename = re.sub(r'[^a-zA-Z0-9_-]', '_', filename)
    return Response(pdf, media_type='application/pdf', headers={'Content-Disposition': f'attachment; filename="{filename}.pdf"'})


@router.get('/{student_id}/export-pdf')
def export_student(student_id: str, request: Request):
    store = request.app.state.store
    student = store['students'].find_one(id_filter(student_id)) or store['students'].find_one({'studentNumber': student_id})
    require(student is not None, 'Student not found', 404)
    return export_pdf(store, [student], f"COR_{student.get('studentNumber', 'student')}_{student.get('lastName', '')}_{student.get('firstName', '')}")


@router.post('/{student_id}/assign-number')
def assign_number(student_id: str, request: Request, body: dict = Body(...)):
    student_number = text(body.get('studentNumber'))
    require(re.fullmatch(r'\d+', student_number) is not None, 'studentNumber must contain only numeric values')
    store = request.app.state.store
    with store.write():
        student = store['students'].find_one(id_filter(student_id))
        require(student is not None, 'Student not found', 404)
        require(student.get('applicantId') is not None, 'Student does not have an applicantId')
        duplicate = store['students'].find_one({
            'studentNumber': student_number,
            '_id': {'$ne': student['_id']},
        })
        if duplicate:
            fail(409, 'Student number already exists', blockReason='student_exists', studentNumber=student_number)
        store['students'].update_one(
            {'_id': student['_id']},
            {'$set': {'studentNumber': student_number, 'updatedAt': utcnow()}, '$unset': {'applicantId': ''}},
        )
        updated = store['students'].find_one({'_id': student['_id']})
        sync_student_changes(store, student, updated)
    return respond(updated)


@router.get('/{student_id}')
def by_id(student_id: str, request: Request):
    result = request.app.state.store['students'].find_one(id_filter(student_id))
    require(result is not None, 'Student not found!', 404)
    return respond(result)


@router.post('', status_code=201)
@router.post('/', status_code=201, include_in_schema=False)
def create(request: Request, body: dict = Body(...)):
    payload = normalize_student(body)
    require(payload.get('studentNumber'), 'studentNumber is required')
    payload.setdefault('status', 'Enrolled')
    for key in BOOL_FIELDS:
        payload.setdefault(key, False)
    for key in ARRAY_FIELDS:
        payload.setdefault(key, [])
    payload.update(createdAt=utcnow(), updatedAt=utcnow())
    store = request.app.state.store
    with store.write():
        payload['_id'] = store['students'].insert_one(payload).inserted_id
        sync_student_changes(store, payload)
    return respond(payload, 201)


@router.put('/{student_id}')
def update(student_id: str, request: Request, body: dict = Body(...)):
    payload = normalize_student(body)
    if 'studentNumber' in payload:
        require(payload['studentNumber'], 'studentNumber cannot be empty')
    store = request.app.state.store
    with store.write():
        previous = store['students'].find_one(id_filter(student_id))
        require(previous is not None, 'Student not found', 404)
        payload['updatedAt'] = utcnow()
        store['students'].update_one({'_id': previous['_id']}, {'$set': payload})
        updated = {**previous, **payload}
        sync_student_changes(store, previous, updated)
    return respond(updated)


@router.delete('/{student_id}')
def delete(student_id: str, request: Request):
    store = request.app.state.store
    with store.write():
        student = store['students'].find_one(id_filter(student_id))
        require(student is not None, 'Student not found', 404)
        store['students'].delete_one({'_id': student['_id']})
        sync_student_changes(store, student)
    return respond({'message': 'Student deleted successfully!'})
