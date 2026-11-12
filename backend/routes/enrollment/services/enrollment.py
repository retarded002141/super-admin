"""Read-only placement previews and advising-aware enrollment."""
from copy import deepcopy
import re
from ..core import as_list, clean_document, fail, number, semester, text, unique, utcnow
from .sections import (SectionGroups, add_student, has_capacity, identity_key,
                       persist_plan, section_name, sync_student_changes)

TEXT_FIELDS = '''studentNumber firstName lastName middleName section semester status year birthDate contactNumber email gender civilStatus placeOfBirth suffix spouseName permanentHouse permanentStreet permanentBarangay permanentCity permanentProvince permanentZip presentHouse presentStreet presentBarangay presentCity presentProvince presentZip fatherName fatherContact motherName motherContact schoolYear course applicantType elementarySchool elementaryAddress elementaryYear juniorHighSchool juniorHighAddress juniorHighYear seniorHighSchool seniorHighAddress seniorHighYear seniorHighGwa collegeSchool collegeAddress collegeYear password'''.split()
BOOL_FIELDS = ['disability', 'indigenous', 'soloParent', 'fourPs']
ARRAY_FIELDS = ['irregularSection', 'irregularYear', 'irregularSubjects']
EXCLUDED_APPLICANT_FIELDS = {
    'isSubmitted', 'admissionStatus', 'photo', 'grade11Gwa', 'grade12Gwa', 'seniorHighGwa', 'gwa',
    'documents', 'examStatus', 'interviewDate', 'interviewLocation',
    'interviewSession', 'interviewStatus', 'interviewTime', 'isInterviewWaived',
    'isUnlocked', 'is_submitted', 'sentEmails', 'strand', 'track',
}
ALIASES = {'studentNumber': 'student_number', 'firstName': 'first_name', 'lastName': 'last_name',
           'middleName': 'middle_name', 'schoolYear': 'school_year', 'birthDate': 'birth_date',
           'contactNumber': 'contact_number', 'fatherName': 'father_name', 'fatherContact': 'father_contact',
           'motherName': 'mother_name', 'motherContact': 'mother_contact'}
for _level, _alias in [('elementary', 'elementary'), ('juniorHigh', 'junior_high'), ('seniorHigh', 'senior_high'), ('college', 'college')]:
    for _suffix in ['School', 'Address']:
        ALIASES[_level + _suffix] = _alias + '_' + _suffix.lower()


def boolean(value):
    return value is True or text(value).lower() in {'true', '1', 'yes'}


def normalize_student(raw, imported=False):
    raw = clean_document(raw)
    result = {}
    for key in TEXT_FIELDS:
        if imported or key in raw or ALIASES.get(key) in raw:
            result[key] = text(raw.get(key, raw.get(ALIASES.get(key), '')))
    for key in BOOL_FIELDS:
        if imported or key in raw:
            result[key] = boolean(raw.get(key))
    for key in ARRAY_FIELDS:
        if key in raw:
            result[key] = deepcopy(as_list(raw[key]))
    if imported:
        result['semester'] = semester(result.get('semester'))
        status = text(result.get('status'))
        result['status'] = 'Enrolled' if status.lower() in {'regular', ''} else 'Irregular' if status.lower() == 'irregular' else status
    return result


def person_name(person):
    return ' '.join(filter(None, (text(person.get(key)) for key in ['firstName', 'lastName', 'suffix']))) or 'Unknown'


def applicant_identifier(person):
    for key in ['applicantId', 'applicantID', 'applicant_id', 'applicant_number']:
        if person.get(key) is not None:
            return text(person[key])
    return ''


def digits(value):
    return re.sub(r'\D', '', text(value))


def identifiers_match(left, right):
    left, right = digits(left), digits(right)
    return bool(left and right and (left == right or left[-4:] == right[-4:]))


def active_records(store):
    return [r for r in store['advisingrecords'].find({'applicantID': {'$exists': True, '$ne': None}})
            if text(r.get('enrollmentStatus')).lower() != 'enrolled']


def applicant_only_record(record):
    return text(record.get('year')) == '1' and text(record.get('semester')) == '1st'


def mark_advised(store):
    numbers = {digits(record['applicantID']) for record in active_records(store)
               if not applicant_only_record(record)}
    ids = [student['_id'] for student in store['students'].find({}, {'studentNumber': 1})
           if digits(student.get('studentNumber')) in numbers]
    if ids:
        store['students'].update_many({'_id': {'$in': ids}}, {'$set': {'status': 'Advised', 'updatedAt': utcnow()}})


def find_applicant(store, requested):
    from ..core import id_filter
    requested = text(requested)
    conditions = [{key: requested} for key in ['applicantId', 'applicantID', 'applicant_id', 'applicant_number']]
    if requested.isdigit():
        conditions += [{key: int(requested)} for key in ['applicantId', 'applicantID', 'applicant_number']]
    conditions.append(id_filter(requested))
    return store['applicants'].find_one({'$or': conditions})


def find_candidate(store, requested):
    records = active_records(store)
    record = next((r for r in records if identifiers_match(r.get('applicantID'), requested)), None)
    if record and applicant_only_record(record):
        applicant = find_applicant(store, requested)
        if applicant:
            student_number = applicant_identifier(applicant) or text(requested)
            return {'applicant': applicant, 'advisingRecord': record, 'studentNumber': student_number, 'isAdvisingRecord': False}
        record = next((r for r in records
                       if not applicant_only_record(r) and identifiers_match(r.get('applicantID'), requested)), None)
    if record:
        # If the advising record's applicantID contains "A-", only look in applicants, not students
        if 'A-' in text(record.get('applicantID', '')):
            applicant = find_applicant(store, requested)
            if applicant:
                student_number = applicant_identifier(applicant) or text(requested)
                return {'applicant': applicant, 'advisingRecord': record, 'studentNumber': student_number, 'isAdvisingRecord': False}
        else:
            student = store['students'].find_one({'studentNumber': {'$in': [digits(record['applicantID']), text(record['applicantID'])]}})
            if student:
                return {'applicant': student, 'advisingRecord': record, 'studentNumber': student['studentNumber'], 'isAdvisingRecord': True}
    applicant = find_applicant(store, requested)
    if not applicant:
        return None
    record = next((r for r in records if identifiers_match(r.get('applicantID'), applicant_identifier(applicant))), None)
    if not record:
        return None
    student_number = applicant_identifier(applicant) or text(requested)
    return {'applicant': applicant, 'advisingRecord': record, 'studentNumber': student_number, 'isAdvisingRecord': False}


def irregular_meta(record, term):
    advised = []
    for subject in record.get('advisedSubjects') or []:
        if not isinstance(subject, dict):
            continue
        subject_id = text(subject.get('subjectId', subject.get('subjectID', subject.get('subject_code'))))
        if subject_id:
            advised.append({'subjectId': subject_id, 'targetYear': text(subject.get('targetYear', subject.get('year'))),
                            'targetSection': section_name(subject.get('targetSection', subject.get('section')))})
    year, section = text(record.get('year')), section_name(record.get('section'))
    placements = {}
    if year and section:
        placements[(year, section)] = {'year': year, 'section': section, 'semester': term}
    for subject in advised:
        if subject['targetYear'] and subject['targetSection']:
            key = (subject['targetYear'], subject['targetSection'])
            placements[key] = {'year': key[0], 'section': key[1], 'semester': term}
    extra = [p for key, p in placements.items() if key != (year, section)]
    # Keep section/year pairs; independent de-duplication loses cross-year assignments.
    return {'baseYear': year, 'baseSection': section, 'placementsToOccupy': list(placements.values()),
            'irregularSection': [p['section'] for p in extra], 'irregularYear': [p['year'] for p in extra],
            'subjectIds': unique(s['subjectId'] for s in advised), 'advisedSubjects': advised}


def make_irregular_room(state):
    irregular_count = number(state.get('irregularCount'))
    irregular_capacity = number(state.get('irregularCapacity'))
    required = max(0, irregular_count - irregular_capacity + 1)
    if required == 0:
        state['_irregularCapacityAdjusted'] = False
        return True
    block_capacity = number(state.get('blockCapacity'))
    if block_capacity < required:
        return False
    state['blockCapacity'] = block_capacity - required
    state['irregularCapacity'] = irregular_capacity + required
    state['totalCapacity'] = number(state.get('totalCapacity')) or block_capacity + irregular_capacity
    state['_irregularCapacityAdjusted'] = True
    return True


def plan_enrollment(store, found, groups, selected=None, direct=False):
    applicant, record = found['applicant'], found.get('advisingRecord')
    student_number = found['studentNumber']
    base = deepcopy(applicant) if found.get('isAdvisingRecord') else normalize_student(applicant, imported=True)
    base.pop('_id', None)
    for field in EXCLUDED_APPLICANT_FIELDS:
        base.pop(field, None)
    if found.get('isAdvisingRecord'):
        base['studentNumber'] = student_number
    else:
        base.pop('studentNumber', None)
        base['applicantId'] = applicant.get('applicantId', student_number)
        base['course'] = 'BSIT'
    if record:
        year, term = text(record.get('year')), semester(record.get('semester'))
        irregular = text(record.get('status')).lower() == 'irregular'
        if not year or term == 'N/A':
            return {'ok': False, 'reason': 'invalid_advising_record', 'message': 'Enrollment blocked: Advising record must include year and semester'}
    else:
        year, term = text(applicant.get('year')), semester(applicant.get('semester'))
        irregular = boolean(applicant.get('isIrregular'))
        if irregular:
            candidate_ids = {text(found.get('requestedID')), applicant_identifier(applicant)}
            candidate_ids |= {re.sub(r'^A-?', '', value, flags=re.I) for value in list(candidate_ids)}
            record = next((r for r in store['advisingrecords'].find({})
                           if any(text(r.get(k)) in candidate_ids for k in ['applicantID', 'applicantId', 'applicant_id', 'applicant_number'])), None)
            if not record:
                return {'ok': False, 'reason': 'missing_advising_record', 'message': 'Enrollment blocked: Missing advising record for irregular applicant'}
    if not year or term == 'N/A':
        return {'ok': False, 'reason': 'invalid_advising_record', 'message': 'Enrollment requires a year and semester'}
    meta = None
    if irregular:
        meta = irregular_meta(record, term)
        if not meta['baseYear'] or not meta['baseSection'] or not meta['subjectIds']:
            return {'ok': False, 'reason': 'invalid_advising_record', 'message': 'Enrollment blocked: Advising record must include year, section and advised subjects'}
        for placement in meta['placementsToOccupy']:
            state = groups.ensure(placement['year'], term, placement['section'])
            if not make_irregular_room(state):
                return {'ok': False, 'reason': 'section_full', 'message': f"Enrollment blocked: Irregular section {placement['year']}-{placement['section']} is full"}
            if not has_capacity(state, 'Irregular'):
                return {'ok': False, 'reason': 'section_full', 'message': f"Enrollment blocked: Irregular section {placement['year']}-{placement['section']} is full"}
        chosen = groups.ensure(meta['baseYear'], term, meta['baseSection'])
        for placement in meta['placementsToOccupy']:
            add_student(groups.ensure(placement['year'], term, placement['section']), 'Irregular')
        base.update(year=meta['baseYear'], semester=term, section=chosen['section'], status='Irregular',
                    irregularSection=meta['irregularSection'], irregularYear=meta['irregularYear'],
                    irregularSubjects=deepcopy(record.get('advisedSubjects') or []))
    else:
        for field in ARRAY_FIELDS:
            base.pop(field, None)
        base['subjects'] = deepcopy(record.get('advisedSubjects') or []) if record else []
        base.update(year=year, semester=term, status='Block')
        chosen = groups.ensure(year, term, selected) if selected else groups.choose(base)
        # Preserve manual placement: selecting a section can expand block capacity.
        chosen['blockCapacity'] = max(number(chosen.get('blockCapacity')), number(chosen.get('blockCount')) + 1)
        chosen['totalCapacity'] = max(number(chosen.get('totalCapacity')), chosen['blockCapacity'] + number(chosen.get('irregularCapacity')))
        add_student(chosen, 'Block')
        base['section'] = chosen['section']
    base['updatedAt'] = utcnow()
    if not found.get('isAdvisingRecord'):
        base['createdAt'] = utcnow()
        base['password'] = 'password123'
    return {'ok': True, 'student': base, 'chosenSection': chosen, 'isIrregular': irregular, 'irregularMeta': meta}


def placement_result(found, requested, plan, groups):
    chosen, student, meta = plan['chosenSection'], plan['student'], plan['irregularMeta']
    is_irregular = text(student.get('status')).lower() == 'irregular'
    placements = [{'year': chosen['year'], 'section': chosen['section'], 'semester': chosen['semester'], 'isMain': True}]
    if meta:
        placements += [{**p, 'isMain': False} for p in meta['placementsToOccupy'] if (p['year'], p['section']) != (chosen['year'], chosen['section'])]
    for placement in placements:
        state = next((
            item for item in groups.groups.get((placement['year'], placement['semester']), [])
            if item['section'] == placement['section']
        ), None)
        if state:
            placements_count = number(state.get('irregularCount')) - (1 if is_irregular else 0)
            placement['displayCount'] = max(0, placements_count)
            placement['displayCapacity'] = number(state.get('irregularCapacity' if is_irregular else 'blockCapacity'))
            placement['capacityAdjusted'] = bool(state.get('_irregularCapacityAdjusted'))
    available = []
    for state in groups.groups.get((chosen['year'], chosen['semester']), []):
        available.append({k: state[k] for k in [
            'year', 'section', 'semester', 'totalCapacity',
            'blockCount', 'blockCapacity', 'irregularCount', 'irregularCapacity', 'isExisting'
        ]})
        count_key = 'irregularCount' if is_irregular else 'blockCount'
        capacity_key = 'irregularCapacity' if is_irregular else 'blockCapacity'
        preview_reservation = (
            1 if state['year'] == chosen['year']
            and state['semester'] == chosen['semester']
            and state['section'] == chosen['section']
            else 0
        )
        available[-1]['displayCount'] = max(0, number(state.get(count_key)) - preview_reservation)
        available[-1]['displayCapacity'] = number(state.get(capacity_key))
    return {'applicantID': requested, 'applicant_name': person_name(found['applicant']), 'studentNumber': found['studentNumber'],
            'assigned_section': chosen['section'], 'assigned_year': chosen['year'], 'assigned_semester': chosen['semester'],
            'status': student['status'], 'isIrregular': is_irregular,
            'irregularSection': student.get('irregularSection', []), 'irregularYear': student.get('irregularYear', []),
            'irregularSubjects': deepcopy(student.get('irregularSubjects', [])),
            'assigned_sections': placements, 'available_sections': available, 'advisedSubjectCount': len(meta['subjectIds']) if meta else 0}


def save_enrollment(store, found, plan, groups):
    student = plan['student']
    previous = found['applicant'] if found.get('isAdvisingRecord') else {}
    if found.get('isAdvisingRecord'):
        if text(student.get('status')).lower() == 'block':
            fields = {key: student.get(key) for key in ['year', 'semester', 'section', 'status', 'subjects', 'updatedAt']}
            unset = {key: '' for key in ARRAY_FIELDS}
            store['students'].update_one({'_id': previous['_id']}, {'$set': fields, '$unset': unset})
        else:
            fields = {key: student.get(key, []) if key in ARRAY_FIELDS else student.get(key) for key in ['year', 'semester', 'section', 'status', *ARRAY_FIELDS, 'updatedAt']}
            store['students'].update_one({'_id': previous['_id']}, {'$set': fields})
        student['_id'] = previous['_id']
    else:
        student['_id'] = store['students'].insert_one(student).inserted_id
        store['applicants'].update_one({'_id': found['applicant']['_id']}, {'$set': {'status': 'Enrolled'}})
    if found.get('advisingRecord'):
        store['advisingrecords'].update_one({'_id': found['advisingRecord']['_id']}, {'$set': {'enrollmentStatus': 'enrolled'}})
    persist_plan(store, groups)
    sync_student_changes(store, previous, student)
    return student


def batch(store, payload, preview=False):
    ids = payload.get('applicantIDs')
    if not isinstance(ids, list) or not ids or not all(isinstance(i, (str, int)) and not isinstance(i, bool) for i in ids):
        fail(400, 'applicantIDs array is required')
    groups = SectionGroups(store)
    results = {'placements' if preview else 'enrolled': [], 'blocked': [], 'notFound': []}
    seen_numbers = set()
    selected = payload.get('selectedSections') or {}
    if not isinstance(selected, dict):
        fail(400, 'selectedSections must be an object')
    for requested in ids:
        found = find_candidate(store, requested)
        if not found:
            results['notFound'].append({'applicantID': requested})
            continue
        number_ = found['studentNumber']
        common = {'applicantID': requested, 'applicant_name': person_name(found['applicant']), 'studentNumber': number_}
        if number_ in seen_numbers or (not found['isAdvisingRecord'] and store['students'].find_one({'applicantId': number_})):
            results['blocked'].append({**common, 'reason': 'student_exists'})
            continue
        # A blocked plan must not reserve capacity for later applicants.
        before = deepcopy(groups.groups)
        plan = plan_enrollment(store, found, groups, selected.get(text(requested)))
        if not plan['ok']:
            groups.groups = before
            results['blocked'].append({**common, 'reason': plan['reason'], 'message': plan['message']})
            continue
        seen_numbers.add(number_)
        if preview:
            results['placements'].append(placement_result(found, requested, plan, groups))
        else:
            save_enrollment(store, found, plan, groups)
            results['enrolled'].append({**common, 'assigned_section': plan['chosenSection']['section'], 'status': plan['student']['status']})
    if not preview:
        results['message'] = f"Batch enrollment completed: {len(results['enrolled'])} enrolled, {len(results['blocked'])} blocked, {len(results['notFound'])} not found"
    return results
