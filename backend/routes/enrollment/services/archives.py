from copy import deepcopy
import re
from ..core import as_list, text, utcnow
from .sections import student_identities
from .schedules import academic_key, section_label, term_key, year_number


def _year_range(value):
    """Extract only the YYYY-YYYY portion from an academic year string."""
    if not value:
        return ''
    m = re.search(r'(\d{4})\s*[-\u2013]\s*(\d{4})', str(value))
    return f"{m.group(1)}-{m.group(2)}" if m else str(value).strip()


def find_classes(student, schedules):
    placements = student_identities(student)
    classes, seen = [], set()
    expected_term = term_key(student.get('semester'))
    expected_year = academic_key(student.get('schoolYear'))
    advised = student.get('irregularSubjects') or []
    advised_codes = {text(s.get('subjectId', s.get('subjectID', s.get('subject_code')))).upper() for s in advised if isinstance(s, dict)}
    chosen_terms = set()
    for schedule in schedules:
        if schedule.get('semester') is not None and term_key(schedule['semester']) != expected_term:
            continue
        sy = academic_key(schedule.get('academicYear', schedule.get('academic_year')))
        if sy and expected_year and _year_range(sy) != _year_range(expected_year):
            continue
        for index, entry in enumerate(schedule.get('classes') or []):
            label = section_label(schedule, entry).upper()
            match = re.search(r'([1-4])[-_\s]*([A-Z]+)$', label)
            code = text(entry.get('subjectCode', entry.get('subject_code'))).upper()
            for placement in placements:
                if (match and (match[1], match[2]) == (year_number(placement['year']), placement['section'])) or (not match and label == placement['section']):
                    key = (placement['year'], placement['section'])
                    # Ignore older schedule versions once the newest matching document is selected.
                    version = (key, text(schedule.get('_id')))
                    if key in chosen_terms and version not in seen:
                        continue
                    if student.get('status') == 'Irregular' and advised_codes and code not in advised_codes:
                        continue
                    entry_key = (text(schedule.get('_id')), index)
                    if entry_key not in seen:
                        classes.append(deepcopy(entry))
                        seen.add(entry_key)
                    seen.add(version)
                    chosen_terms.add(key)
                    break
    return classes


def archive_schedules(store, students, schedules):
    fields = ['studentNumber', 'schoolYear', 'year', 'section', 'semester', 'status', 'firstName', 'middleName', 'lastName', 'suffix']
    for student in students:
        classes = find_classes(student, schedules)
        if not classes or not student.get('studentNumber'):
            continue
        snapshot = {key: student[key] for key in fields if key in student}
        if student.get('status') == 'Irregular':
            snapshot.update({key: student.get(key, []) for key in ['irregularYear', 'irregularSection']})
        snapshot['classes'] = classes
        latest = store['studentarchive'].find_one({'studentNumber': student['studentNumber']}, sort=[('createdAt', -1)])
        if latest and all(latest.get(key) == value for key, value in snapshot.items()):
            continue
        store['studentarchive'].insert_one({**snapshot, 'createdAt': utcnow()})
