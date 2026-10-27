from fastapi import APIRouter, Body, Request
from .core import clean_document, id_filter, number, require, respond, semester, text, utcnow
from .services.enrollment import mark_advised
from .services.sections import (actual_counts, capacities, default_capacities, identity, identity_key,
                                rebalance, section_name, section_status, student_identities, sync_all)

router = APIRouter(prefix='/api/sections', tags=['Sections'])


@router.post('/sync')
def sync(request: Request):
    store = request.app.state.store
    with store.write():
        result = sync_all(store)
    return respond({'message': 'Sections synced successfully', 'sections': result})


@router.get('/meta')
def meta(request: Request):
    return respond({'irregularTotal': request.app.state.store['students'].count_documents({'status': 'Irregular'})})


@router.get('')
@router.get('/', include_in_schema=False)
def list_sections(request: Request):
    store = request.app.state.store
    with store.write():
        mark_advised(store)
        sections = sync_all(store)
    return respond(sections)


@router.post('', status_code=201)
@router.post('/', status_code=201, include_in_schema=False)
def create(request: Request, body: dict = Body(...)):
    body = clean_document(body)
    item = identity(body.get('year'), body.get('semester'), body.get('section'))
    require(item['section'], 'Section name is required')
    require(item['year'] in {'1', '2', '3', '4'}, 'Year must be 1, 2, 3, or 4')
    require(item['semester'] in {'1st', '2nd'}, 'Semester must be 1st or 2nd')
    store = request.app.state.store
    with store.write():
        require(store['sections'].find_one(item) is None, 'Section already exists', 409)
        caps = default_capacities(store, item['year'], item['semester'])
        result = {**item, **caps, 'blockCount': 0, 'irregularCount': 0,
                  'status': section_status(0, 0, caps['totalCapacity']), 'createdAt': utcnow(), 'updatedAt': utcnow()}
        result['_id'] = store['sections'].insert_one(result).inserted_id
    return respond(result, 201)


@router.patch('/capacity/all')
def capacity_all(request: Request, body: dict = Body(...)):
    body = clean_document(body)
    targets = body.get('targetSections')
    require(targets is None or isinstance(targets, list) and bool(targets) and all(isinstance(t, dict) for t in targets), 'At least one target section is required')
    if all(body.get(field) is not None and text(body[field]) != '' for field in ['blockCapacity', 'irregularCapacity']):
        block, irregular = max(0, number(body['blockCapacity'])), max(0, number(body['irregularCapacity']))
        caps = {'blockCapacity': block, 'irregularCapacity': irregular, 'totalCapacity': block + irregular}
    else:
        caps = capacities(max(0, number(body.get('totalCapacity'))))
    query = {'$or': [identity(t.get('year'), t.get('semester'), t.get('section')) for t in targets]} if targets else {}
    auto = body.get('applyAutoSectioning') is not False
    store = request.app.state.store
    with store.write():
        sections = list(store['sections'].find(query))
        current_counts = actual_counts(store)
        adjusted_caps = {}
        for section in sections:
            section_key = identity_key(section)
            counts = current_counts.get(identity_key(section), {})
            irregular_count = counts.get('irregularCount', section.get('irregularCount', 0))
            irregular_capacity = caps['irregularCapacity']
            block_capacity = caps['blockCapacity']
            if irregular_count > irregular_capacity:
                shortage = irregular_count - irregular_capacity
                irregular_capacity = irregular_count
                block_capacity = max(0, block_capacity - shortage)
            adjusted_caps[section_key] = {
                'blockCapacity': block_capacity,
                'irregularCapacity': irregular_capacity,
                'totalCapacity': block_capacity + irregular_capacity,
            }
        if auto:
            groups = {(s['year'], s['semester']) for s in sections}
            for year, term in groups:
                # If the template block capacity itself is 0 and block students exist,
                # no section can ever receive block students.
                # If template caps['blockCapacity'] > 0, the auto-rebalancing
                # safety net will dynamically create a new section to house the affected block students.
                if caps['blockCapacity'] <= 0:
                    require(
                        not store['students'].find_one({'year': year, 'semester': term, 'status': 'Block'}),
                        'Cannot auto-section Block students with zero block capacity', 409
                    )
        modified = 0
        for section in sections:
            modified += store['sections'].update_one(
                {'_id': section['_id']},
                {'$set': {**adjusted_caps[identity_key(section)], 'updatedAt': utcnow()}},
            ).modified_count
        rebalanced = []
        if auto:
            groups = {}
            for s in sections:
                groups.setdefault((s['year'], s['semester']), s['section'])
            for (year, term), preferred in groups.items():
                rebalanced.extend(rebalance(
                    store,
                    year,
                    term,
                    preferred if targets else None,
                    caps,
                ))
            for section in sections:
                store['sections'].update_one(
                    identity(*identity_key(section)),
                    {'$set': {**adjusted_caps[identity_key(section)], 'updatedAt': utcnow()}},
                )
        else:
            for section in sections:
                section_caps = adjusted_caps[identity_key(section)]
                store['sections'].update_one({'_id': section['_id']}, {'$set': {
                    'status': section_status(section.get('blockCount'), section.get('irregularCount'), section_caps['totalCapacity'])
                }})
        if targets:
            target_groups = {(text(t.get('year')), semester(t.get('semester'))) for t in targets}
            group_query = {'$or': [{'year': y, 'semester': s} for y, s in target_groups]}
            updated = list(store['sections'].find(group_query))
        else:
            updated = list(store['sections'].find({}))
    return respond({'message': 'All sections capacity updated successfully', 'modified': modified,
                    'rebalanced': len(rebalanced), 'autoSectioningApplied': auto, 'sections': updated})


@router.patch('/{section_id}')
def update(section_id: str, request: Request, body: dict = Body(...)):
    store = request.app.state.store
    with store.write():
        current = store['sections'].find_one(id_filter(section_id))
        require(current is not None, 'Section not found', 404)
        caps = capacities(max(0, number(body.get('totalCapacity', current.get('totalCapacity')))))
        store['sections'].update_one({'_id': current['_id']}, {'$set': {**caps, 'updatedAt': utcnow(),
            'status': section_status(current.get('blockCount'), current.get('irregularCount'), caps['totalCapacity'])}})
    return respond(store['sections'].find_one({'_id': current['_id']}))


@router.delete('/{section_id}')
def delete(section_id: str, request: Request):
    store = request.app.state.store
    with store.write():
        current = store['sections'].find_one(id_filter(section_id))
        require(current is not None, 'Section not found', 404)
        actual = actual_counts(store).get(identity_key(current), {})
        require(not actual.get('blockCount') and not actual.get('irregularCount'), 'Cannot delete section with enrolled students', 409)
        store['sections'].delete_one({'_id': current['_id']})
    return respond({'message': 'Section deleted successfully'})
