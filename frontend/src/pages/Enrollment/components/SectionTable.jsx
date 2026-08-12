import React, { useEffect, useState } from 'react';
import api from '../lib/axios';
import Modal from './Modal';

function SectionTable({ sections = [] }) {
    const [curriculumSection, setCurriculumSection] = useState(null);
    const [studentSection, setStudentSection] = useState(null);
    const [studentListKind, setStudentListKind] = useState(null);
    const [studentRows, setStudentRows] = useState([]);
    const [studentLoading, setStudentLoading] = useState(false);
    const [studentError, setStudentError] = useState('');
    const [selectedCurriculumSubjects, setSelectedCurriculumSubjects] = useState([]);
    const [curriculumLoading, setCurriculumLoading] = useState(false);
    const [curriculumError, setCurriculumError] = useState('');
    const [curriculumCache, setCurriculumCache] = useState({});

    const normalizeYearKey = (year) => {
        const raw = String(year ?? '').trim().toLowerCase();
        const map = {
            '1': '1st',
            '1st': '1st',
            first: '1st',
            'first year': '1st',
            '2': '2nd',
            '2nd': '2nd',
            second: '2nd',
            'second year': '2nd',
            '3': '3rd',
            '3rd': '3rd',
            third: '3rd',
            'third year': '3rd',
            '4': '4th',
            '4th': '4th',
            fourth: '4th',
            'fourth year': '4th',
        };

        return map[raw] || null;
    };

    const getSemesterIndex = (semester) => {
        const raw = String(semester ?? '').trim().toLowerCase();

        if (['1', '1st', 'first', 'first semester', '1st semester'].includes(raw)) {
            return 0;
        }

        if (['2', '2nd', 'second', 'second semester', '2nd semester'].includes(raw)) {
            return 1;
        }

        return -1;
    };

    const getStatusStyle = (status) => {
        if (status === 'Available') {
            return 'bg-green-100 text-green-700 font-bold';
        }
        if (status === 'Full') {
            return 'bg-yellow-100 text-yellow-700 font-bold';
        }
        return 'bg-red-100 text-red-700 font-bold';
    };

    const getCapacityStateStyle = (actual, capacity) => {
        const actualNum = Number(actual || 0);
        const capacityNum = Number(capacity || 0);

        if (actualNum < capacityNum) {
            return 'text-green-600 font-semibold';
        }
        if (actualNum === capacityNum) {
            return 'text-yellow-600 font-semibold';
        }
        return 'text-red-600 font-semibold';
    };

    const openStudentList = (section, kind) => {
        setStudentSection(section);
        setStudentListKind(kind);
        setStudentRows([]);
        setStudentError('');
    };

    const studentModalTitle = studentListKind === 'regular' ? 'Enrolled Students' : 'Irregular Students';

    const handleOpenSectionCurriculum = (section) => {
        setCurriculumSection(section);
        setSelectedCurriculumSubjects([]);
        setCurriculumError('');
    };

    useEffect(() => {
        const fetchSectionCurriculum = async () => {
            if (!curriculumSection) {
                setSelectedCurriculumSubjects([]);
                setCurriculumError('');
                return;
            }

            try {
                setCurriculumLoading(true);
                setSelectedCurriculumSubjects([]);
                setCurriculumError('');

                const yearKey = normalizeYearKey(curriculumSection?.year);
                const semesterIndex = getSemesterIndex(curriculumSection?.semester);

                if (!yearKey || semesterIndex < 0) {
                    setCurriculumError('Curriculum is unavailable for this section year/semester.');
                    return;
                }

                let curriculumDoc = curriculumCache[yearKey];
                if (!curriculumDoc) {
                    const res = await api.get(`/curriculum/${yearKey}`);
                    curriculumDoc = res.data;
                    setCurriculumCache((prev) => ({ ...prev, [yearKey]: curriculumDoc }));
                }

                const semesterSubjects = curriculumDoc?.semesters?.[semesterIndex]?.subjects;
                if (!Array.isArray(semesterSubjects) || semesterSubjects.length === 0) {
                    setCurriculumError('No curriculum subjects found for this semester.');
                    return;
                }

                setSelectedCurriculumSubjects(semesterSubjects);
            } catch {
                setCurriculumError('Failed to load curriculum data.');
            } finally {
                setCurriculumLoading(false);
            }
        };

        fetchSectionCurriculum();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [curriculumSection]);

    useEffect(() => {
        const fetchSectionStudents = async () => {
            if (!studentSection || !studentListKind) {
                setStudentRows([]);
                setStudentError('');
                return;
            }

            try {
                setStudentLoading(true);
                setStudentRows([]);
                setStudentError('');

                const status = studentListKind === 'regular' ? 'Enrolled' : 'Irregular';
                const params = {
                    status,
                    year: String(studentSection.year ?? '').trim(),
                    section: String(studentSection.section ?? '').trim(),
                    semester: String(studentSection.semester ?? '').trim(),
                };

                const res = await api.get('/students', { params });
                const rows = Array.isArray(res.data) ? res.data : [];
                rows.sort((left, right) => {
                    const leftNum = String(left.student_number ?? '');
                    const rightNum = String(right.student_number ?? '');
                    return leftNum.localeCompare(rightNum, undefined, { numeric: true, sensitivity: 'base' });
                });
                setStudentRows(rows);
            } catch {
                setStudentError('Failed to load students.');
            } finally {
                setStudentLoading(false);
            }
        };

        fetchSectionStudents();
    }, [studentSection, studentListKind]);

    return (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden font-sans h-full min-h-[380px] flex flex-col w-full">
            <div className="flex-1 min-h-[380px] overflow-y-auto custom-scrollbar">
                <table className="min-w-full border-collapse text-left text-sm md:text-base whitespace-nowrap">
                    <thead className="sticky top-0 z-10 bg-[#E4F6E2] border-b border-[#BFD9BC] text-[#315B46]">
                        <tr>
                            <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-[#315B46]">Year</th>
                            <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-[#315B46]">Section</th>
                            <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-[#315B46] text-center">Regular</th>
                            <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-[#315B46] text-center">Irregular</th>
                            <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-[#315B46] text-center">Total</th>
                            <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-[#315B46] text-center">Capacity</th>
                            <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-[#315B46] text-center">Curriculum</th>
                            <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-[#315B46] text-center">Semester</th>
                            <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-[#315B46] text-center">Status</th>
                        </tr>
                    </thead>

                    <tbody className="divide-y divide-gray-100">
                        {sections && sections.length > 0 ? (
                            sections.map((sec) => {
                                return (
                                    <tr key={`${sec.year}-${sec.section}-${sec.semester ?? 'N/A'}`} className="hover:bg-gray-50/80 transition-colors">
                                        <td className="px-6 py-4 font-medium text-gray-900">{sec.year}</td>
                                        <td className="px-6 py-4 text-gray-800 font-medium">{sec.section}</td>
                                        <td className="px-6 py-4 text-center">
                                            <button
                                                type="button"
                                                onClick={() => openStudentList(sec, 'regular')}
                                                className={`${getCapacityStateStyle(sec.regular, sec.regular_capacity)} underline underline-offset-2 hover:opacity-80`}
                                                aria-label={`View enrolled students for section ${sec.section}`}
                                            >
                                                {`${sec.regular ?? 0}/${sec.regular_capacity ?? 45}`}
                                            </button>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <button
                                                type="button"
                                                onClick={() => openStudentList(sec, 'irregular')}
                                                className={`${getCapacityStateStyle(sec.irregular, sec.irregular_capacity)} underline underline-offset-2 hover:opacity-80`}
                                                aria-label={`View irregular students for section ${sec.section}`}
                                            >
                                                {`${sec.irregular ?? 0}/${sec.irregular_capacity ?? 5}`}
                                            </button>
                                        </td>
                                        <td className="px-6 py-4 text-gray-900 font-semibold text-center">{sec.total}</td>
                                        <td className="px-6 py-4 text-center text-gray-700 font-medium">{sec.total_capacity}</td>

                                        <td className="px-6 py-4 text-center">
                                            <button
                                                onClick={() => handleOpenSectionCurriculum(sec)}
                                                className="text-gray-400 hover:text-[#2E522A] transition-colors p-2 rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[#2E522A]/50 disabled:hover:bg-transparent disabled:hover:text-gray-400"
                                                aria-label="View Curriculum"
                                                title="View Curriculum"
                                            >
                                                <i className="fa-solid fa-caret-down text-xl"></i>
                                            </button>
                                        </td>

                                        <td className="px-6 py-4 text-gray-700 font-medium text-center">{sec.semester ?? 'N/A'}</td>

                                        <td className="px-6 py-4 text-center">
                                            <span className={`inline-flex items-center justify-center px-4 py-1.5 rounded-full text-xs tracking-wide w-28 ${getStatusStyle(sec.status)}`}>
                                                {sec.status}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })
                        ) : (
                            <tr>
                                <td colSpan="9" className="px-6 py-12 text-center text-gray-500">
                                    <div className="flex flex-col items-center justify-center gap-2">
                                        <i className="fa-regular fa-folder-open text-3xl opacity-50"></i>
                                        <p>No sections found.</p>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <Modal
                open={Boolean(curriculumSection)}
                onClose={() => {
                    setCurriculumSection(null);
                    setSelectedCurriculumSubjects([]);
                    setCurriculumError('');
                }}
                title={curriculumSection ? `Section Curriculum - Year ${curriculumSection.year}, Section ${curriculumSection.section}` : 'Section Curriculum'}
            >
                <div className="space-y-4">
                    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                        <p className="text-sm text-gray-700">
                            Shared curriculum for all enrolled students in this section.
                        </p>
                    </div>

                    {curriculumLoading ? (
                        <div className="min-h-[260px] flex flex-col items-center justify-center text-gray-500 gap-3">
                            <i className="fa-solid fa-circle-notch fa-spin text-3xl text-[#2E522A]"></i>
                            <p className="text-sm font-medium">Loading curriculum...</p>
                        </div>
                    ) : curriculumError ? (
                        <div className="min-h-[260px] flex flex-col items-center justify-center text-gray-500 gap-2 text-center">
                            <i className="fa-regular fa-calendar-xmark text-4xl text-gray-400 opacity-70"></i>
                            <p className="text-base font-semibold text-gray-700">Curriculum details not available.</p>
                            <p className="text-sm text-gray-500">{curriculumError}</p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                            <table className="min-w-full text-sm border-collapse">
                                <thead className="bg-[#E4F6E2] border-b border-[#BFD9BC] text-[#315B46]">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs uppercase tracking-wider font-semibold">Code</th>
                                        <th className="px-4 py-3 text-left text-xs uppercase tracking-wider font-semibold">Title</th>
                                        <th className="px-4 py-3 text-center text-xs uppercase tracking-wider font-semibold">Lec</th>
                                        <th className="px-4 py-3 text-center text-xs uppercase tracking-wider font-semibold">Lab</th>
                                        <th className="px-4 py-3 text-center text-xs uppercase tracking-wider font-semibold">Units</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {selectedCurriculumSubjects.map((subject, idx) => (
                                        <tr key={`${subject.subject_code || subject.code || 'subject'}-${idx}`} className="hover:bg-gray-50/80">
                                            <td className="px-4 py-3 text-gray-800 font-medium whitespace-nowrap">{subject.subject_code || subject.code || '-'}</td>
                                            <td className="px-4 py-3 text-gray-700">{subject.title || '-'}</td>
                                            <td className="px-4 py-3 text-center text-gray-600">{subject.lecture ?? 0}</td>
                                            <td className="px-4 py-3 text-center text-gray-600">{subject.laboratory ?? 0}</td>
                                            <td className="px-4 py-3 text-center text-gray-800 font-semibold">{subject.units ?? 0}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </Modal>

            <Modal
                open={Boolean(studentSection && studentListKind)}
                onClose={() => {
                    setStudentSection(null);
                    setStudentListKind(null);
                    setStudentRows([]);
                    setStudentError('');
                }}
                title={studentSection && studentListKind
                    ? `${studentModalTitle} - Year ${studentSection.year}, Section ${studentSection.section}`
                    : 'Students'}
            >
                <div className="space-y-4">
                    {studentLoading ? (
                        <div className="min-h-[220px] flex flex-col items-center justify-center text-gray-500 gap-3">
                            <i className="fa-solid fa-circle-notch fa-spin text-3xl text-[#2E522A]"></i>
                            <p className="text-sm font-medium">Loading students...</p>
                        </div>
                    ) : studentError ? (
                        <div className="min-h-[220px] flex flex-col items-center justify-center text-gray-500 gap-2 text-center">
                            <i className="fa-regular fa-circle-xmark text-4xl text-gray-400 opacity-70"></i>
                            <p className="text-base font-semibold text-gray-700">Student list unavailable.</p>
                            <p className="text-sm text-gray-500">{studentError}</p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                            <table className="min-w-full text-sm border-collapse">
                                <thead className="bg-[#E4F6E2] border-b border-[#BFD9BC] text-[#315B46]">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs uppercase tracking-wider font-semibold">Student Number</th>
                                        <th className="px-4 py-3 text-left text-xs uppercase tracking-wider font-semibold">Name</th>
                                        <th className="px-4 py-3 text-center text-xs uppercase tracking-wider font-semibold">Year</th>
                                        <th className="px-4 py-3 text-center text-xs uppercase tracking-wider font-semibold">Semester</th>
                                        <th className="px-4 py-3 text-center text-xs uppercase tracking-wider font-semibold">Section</th>
                                        <th className="px-4 py-3 text-center text-xs uppercase tracking-wider font-semibold">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {studentRows.length > 0 ? studentRows.map((student) => {
                                        const fullName = `${String(student.first_name ?? '').trim()} ${String(student.last_name ?? '').trim()}`.trim();
                                        return (
                                            <tr key={student._id || student.student_number} className="hover:bg-gray-50/80">
                                                <td className="px-4 py-3 text-gray-800 font-medium whitespace-nowrap">{student.student_number || '-'}</td>
                                                <td className="px-4 py-3 text-gray-700">{fullName || '-'}</td>
                                                <td className="px-4 py-3 text-center text-gray-600">{student.year ?? '-'}</td>
                                                <td className="px-4 py-3 text-center text-gray-600">{student.semester ?? '-'}</td>
                                                <td className="px-4 py-3 text-center text-gray-600">{student.section ?? '-'}</td>
                                                <td className="px-4 py-3 text-center text-gray-800 font-semibold">{student.status ?? '-'}</td>
                                            </tr>
                                        );
                                    }) : (
                                        <tr>
                                            <td colSpan="6" className="px-4 py-10 text-center text-gray-500">
                                                No students found in this section.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </Modal>
        </div>
    );
}

export default SectionTable;