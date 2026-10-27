"""Section counts and capacity planning, including irregular cross-year placements."""
from copy import deepcopy
from pathlib import Path
import json
import math
from ..core import as_list, number, semester, text, utcnow, fail

_candidates = [
    Path(__file__).resolve().parents[3] / 'fileTemplates/sectionTemplates/sectionTemplate(JSON).json',
    Path(__file__).resolve().parents[4] / 'fileTemplates/sectionTemplates/sectionTemplate(JSON).json',
    Path(__file__).resolve().parents[4] / 'toIntegrate/preEnrollmentV9.4/fileTemplates/sectionTemplates/sectionTemplate(JSON).json'
]
_TEMPLATE_FILE = next((p for p in _candidates if p.is_file()), _candidates[0])
_TEMPLATE = json.loads(_TEMPLATE_FILE.read_text(encoding='utf-8')) if _TEMPLATE_FILE.is_file() else {}
_TEMPLATE = _TEMPLATE[0] if isinstance(_TEMPLATE, list) else _TEMPLATE
DEFAULT_TOTAL = number(_TEMPLATE.get('totalCapacity'), 50) or 50


def capacities(total=DEFAULT_TOTAL):
    total = number(total, DEFAULT_TOTAL)
    if total < 0:
        total = DEFAULT_TOTAL
    return {'totalCapacity': total, 'blockCapacity': total * .9, 'irregularCapacity': total * .1}


DEFAULT_CAPACITIES = {
    'blockCapacity': number(_TEMPLATE.get('blockCapacity'), 45),
    'irregularCapacity': number(_TEMPLATE.get('irregularCapacity'), 5),
}
DEFAULT_CAPACITIES['totalCapacity'] = sum(DEFAULT_CAPACITIES.values())


def section_status(block=0, irregular=0, total=DEFAULT_TOTAL):
    count = number(block) + number(irregular)
    return 'Available' if count < number(total) else 'Full' if count == number(total) else 'Overloaded'


def section_name(value):
    return text(value).upper()


def identity(year, term, section):
    return {'year': text(year), 'semester': semester(term), 'section': section_name(section)}


def identity_key(item):
    return (text(item.get('year')), semester(item.get('semester')), section_name(item.get('section')))


def student_identities(student):
    result = {}
    def add(year, section):
        item = identity(year, student.get('semester'), section)
        if item['year'] and item['section']:
            result[identity_key(item)] = item
    add(student.get('year'), student.get('section'))
    # Explicit advised placements preserve pairs even when multiple years use A/B.
    if text(student.get('status')).lower() == 'irregular':
        subjects = student.get('irregularSubjects') or []
        for subject in subjects:
            if isinstance(subject, dict):
                add(subject.get('targetYear', subject.get('year')), subject.get('targetSection', subject.get('section')))
        sections, years = as_list(student.get('irregularSection')), as_list(student.get('irregularYear'))
        for index, section in enumerate(sections):
            add(years[index] if index < len(years) else years[0] if years else '', section)
        if len(sections) == 1:
            for year in years[1:]:
                add(year, sections[0])
    return list(result.values())


def capacities_from(section):
    if not section:
        return None
    if section.get('blockCapacity') is not None and section.get('irregularCapacity') is not None:
        block, irregular = number(section['blockCapacity']), number(section['irregularCapacity'])
        if block >= 0 and irregular >= 0:
            return {'blockCapacity': block, 'irregularCapacity': irregular, 'totalCapacity': block + irregular}
    if section.get('totalCapacity') is not None:
        return capacities(section['totalCapacity'])
    return None


def default_capacities(store, year='', term=''):
    if year and term:
        preferred = store['sections'].find_one({'year': text(year), 'semester': semester(term)}, sort=[('updatedAt', -1), ('createdAt', -1)])
        if value := capacities_from(preferred):
            return value
    latest = store['sections'].find_one({}, sort=[('updatedAt', -1), ('createdAt', -1)])
    return capacities_from(latest) or deepcopy(DEFAULT_CAPACITIES)


def create_state(year, term, name, source=None):
    caps = capacities_from(source) or deepcopy(DEFAULT_CAPACITIES)
    return {**identity(year, term, name), **caps, 'createdAt': utcnow(), 'blockCount': 0,
            'irregularCount': 0, 'status': section_status(0, 0, caps['totalCapacity']), 'isExisting': False}


def add_student(state, status):
    field = 'irregularCount' if text(status).lower() == 'irregular' else 'blockCount'
    state[field] = number(state.get(field)) + 1
    state['status'] = section_status(state.get('blockCount'), state.get('irregularCount'), state.get('totalCapacity'))
    return state


def has_capacity(state, status):
    prefix = 'irregular' if text(status).lower() == 'irregular' else 'block'
    return number(state.get(prefix + 'Count')) < number(state.get(prefix + 'Capacity'), DEFAULT_CAPACITIES[prefix + 'Capacity'])


def section_index(name):
    name = section_name(name)
    if not name or any(c not in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' for c in name):
        return 2**53
    result = 0
    for char in name:
        result = result * 26 + ord(char) - 64
    return result


def index_name(index):
    result = ''
    while index > 0:
        index, remainder = divmod(index - 1, 26)
        result = chr(65 + remainder) + result
    return result


def next_name(used):
    for index in range(1, 1000):
        if (name := index_name(index)) not in used:
            return name
    fail(409, 'Unable to allocate a new section name')


class SectionGroups:
    def __init__(self, store):
        self.groups = {}
        self.default = default_capacities(store)
        # Recount instead of trusting stale section counters during preview/allocation.
        actual = actual_counts(store)
        for section in store['sections'].find({}):
            key = identity_key(section)
            if not key[0] or not key[2]:
                continue
            entry = {**section, **identity(*key), **(capacities_from(section) or self.default),
                     'blockCount': actual.get(key, {}).get('blockCount', 0),
                     'irregularCount': actual.get(key, {}).get('irregularCount', 0), 'isExisting': True}
            self.groups.setdefault(key[:2], []).append(entry)

    def ensure(self, year, term, name):
        year, term, name = text(year), semester(term), section_name(name)
        group = self.groups.setdefault((year, term), [])
        for section in group:
            if section['section'] == name:
                return section
        state = create_state(year, term, name, group[0] if group else self.default)
        group.append(state)
        return state

    def choose(self, student):
        year, term = text(student.get('year')), semester(student.get('semester'))
        group = self.groups.setdefault((year, term), [])
        ordered = sorted(group, key=lambda s: (text(s.get('createdAt')), section_index(s['section']), s['section']))
        for section in ordered:
            if has_capacity(section, student.get('status')):
                return section
        name = next_name({s['section'] for s in group})
        state = create_state(year, term, name, ordered[0] if ordered else self.default)
        if not has_capacity(state, student.get('status')):
            fail(409, 'Section capacity for this student type is zero')
        group.append(state)
        return state


def actual_counts(store):
    counts = {}
    for student in store['students'].find({'status': {'$in': ['Block', 'Irregular']}}):
        for item in student_identities(student):
            key = identity_key(item)
            entry = counts.setdefault(key, {**item, 'blockCount': 0, 'irregularCount': 0})
            entry['irregularCount' if student['status'] == 'Irregular' else 'blockCount'] += 1
    return counts


def sync_one(store, item, counts=None):
    key = identity_key(item)
    if not key[0] or not key[2]:
        return None
    item = identity(*key)
    current = store['sections'].find_one(item)
    actual = (counts if counts is not None else actual_counts(store)).get(key, {})
    block, irregular = actual.get('blockCount', 0), actual.get('irregularCount', 0)
    if not block and not irregular:
        if current:
            store['sections'].delete_one({'_id': current['_id']})
        return None
    caps = capacities_from(current) or default_capacities(store, key[0], key[1])
    payload = {**item, **caps, 'blockCount': block, 'irregularCount': irregular,
               'status': section_status(block, irregular, caps['totalCapacity']), 'updatedAt': utcnow()}
    store['sections'].update_one(item, {'$set': payload, '$setOnInsert': {'createdAt': utcnow()}}, upsert=True)
    return store['sections'].find_one(item)


def sync_all(store):
    counts = actual_counts(store)
    identities = {identity_key(s): s for s in store['sections'].find({})}
    identities.update({key: identity(*key) for key in counts})
    for item in identities.values():
        sync_one(store, item, counts)
    return list(store['sections'].find({}).sort([('year', 1), ('section', 1), ('semester', 1)]))


def persist_plan(store, groups):
    for group in groups.groups.values():
        for state in group:
            item = identity_key(state)
            fields = {k: state[k] for k in ['blockCapacity', 'irregularCapacity', 'totalCapacity']}
            store['sections'].update_one(identity(*item), {'$set': {**fields, 'updatedAt': utcnow()}, '$setOnInsert': {'createdAt': utcnow()}}, upsert=True)


def sync_student_changes(store, *students):
    counts = actual_counts(store)
    identities = {identity_key(item): item for student in students for item in student_identities(student or {})}
    for item in identities.values():
        sync_one(store, item, counts)


def rebalance(store, year, term, preferred=None, capacity_template=None):
    query = {'year': text(year), 'semester': semester(term)}
    sections = list(store['sections'].find(query))
    sections.sort(key=lambda s: (s['section'] != preferred if preferred else False, section_index(s['section'])))
    source = sections[0] if sections else create_state(year, term, 'A')
    students = list(store['students'].find({**query, 'status': 'Block'}).sort('studentNumber', 1))
    if not students:
        sync_all(store)
        return list(store['sections'].find(query).sort('section', 1))
    caps = capacities_from(capacity_template) or capacities_from(source) or DEFAULT_CAPACITIES
    for status, field in [('Block', 'blockCapacity'), ('Irregular', 'irregularCapacity')]:
        if any(s['status'] == status for s in students) and caps[field] <= 0:
            fail(409, f'Cannot auto-section {status} students with zero {field}')
    needed = max(1, *(math.ceil(sum(s['status'] == status for s in students) / max(.001, caps[field]))
                       for status, field in [('Block', 'blockCapacity'), ('Irregular', 'irregularCapacity')]))
    counts = actual_counts(store)
    irregular_sections = [
        section for section in sections
        if counts.get(identity_key(section), {}).get('irregularCount', 0) > 0
    ]
    selected_sections = irregular_sections + [
        section for section in sections[:needed]
        if section not in irregular_sections
    ]
    working = []
    for section in selected_sections:
        state = create_state(year, term, section['section'], section)
        section_counts = counts.get(identity_key(section), {})
        state['irregularCount'] = section_counts.get('irregularCount', 0)
        # Safety net: If irregular students exceed irregular capacity, adjust capacities
        irreg_count = state['irregularCount']
        irreg_cap = state.get('irregularCapacity', 0)
        if irreg_count > irreg_cap:
            shortage = irreg_count - irreg_cap
            state['irregularCapacity'] = irreg_count
            state['blockCapacity'] = max(0, state.get('blockCapacity', 0) - shortage)
            state['totalCapacity'] = state['irregularCapacity'] + state['blockCapacity']
        working.append(state)
    used = {s['section'] for s in working}

    # Safety net: Calculate actual available block capacity across working sections.
    # Sections whose block capacity was reduced to 0 or negative by irregular adjustments cannot house block students.
    total_block_capacity = sum(max(0, number(s.get('blockCapacity', 0))) for s in working)
    while (len(working) < needed or total_block_capacity < len(students)) and caps.get('blockCapacity', 0) > 0:
        name = next_name(used)
        used.add(name)
        new_state = create_state(year, term, name, caps)
        working.append(new_state)
        total_block_capacity += max(0, number(new_state.get('blockCapacity', 0)))

    for student in students:
        placed = False
        for state in working:
            if has_capacity(state, student['status']):
                store['students'].update_one({'_id': student['_id']}, {'$set': {'section': state['section'], 'updatedAt': utcnow()}})
                add_student(state, student['status'])
                placed = True
                break
        if not placed and caps.get('blockCapacity', 0) > 0:
            name = next_name(used)
            used.add(name)
            new_state = create_state(year, term, name, caps)
            working.append(new_state)
            store['students'].update_one({'_id': student['_id']}, {'$set': {'section': new_state['section'], 'updatedAt': utcnow()}})
            add_student(new_state, student['status'])

    # Preserve cross-year placements rather than deleting an externally occupied section.
    for state in working:
        item = identity(*identity_key(state))
        state_caps = {
            'blockCapacity': state['blockCapacity'],
            'irregularCapacity': state['irregularCapacity'],
            'totalCapacity': state['totalCapacity'],
        }
        store['sections'].update_one(item, {'$set': {**state_caps, 'updatedAt': utcnow()}, '$setOnInsert': {'createdAt': utcnow()}}, upsert=True)
    sync_all(store)
    return list(store['sections'].find(query).sort('section', 1))
