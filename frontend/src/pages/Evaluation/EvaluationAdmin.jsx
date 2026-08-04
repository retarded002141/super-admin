import React, { useState, useEffect } from 'react';
import './EvaluationAdmin.css';
import Dashboard from './Dashboard';
import EvaluationCriteria from './EvaluationCriteria';
import EvaluationReports from './EvaluationReports';
import Settings from './Settings';
import EditQuestionnaire from './EditQuestionnaire';
import StudentEvaluation from './StudentEvaluation';
import ClassroomObservationOnline from './ClassroomObservationOnline';
import SelfEvaluation from './SelfEvaluation';
import PeerEvaluation from './PeerEvaluation';

// Mirrors the Faculty Evaluation project's own App.jsx initialFormsData fallback,
// so the Evaluation tab still works even if the Faculty Evaluation backend
// (Flask, default localhost:5001) is unreachable.
const initialFormsData = {
  "Student Evaluation": [
    { title: "PROFESSIONALISM", questions: ["Well-groomed and dresses appropriately.", "Provides equal chances for participation for students in class.", "Includes in quizzes and periodic examinations only the topics that were discussed", "Shows respect for students.", "Is approachable"] },
    { title: "SUBJECT MATTER", questions: ["Explains the subject matter clearly", "Accomplishes the objectives of the day's lesson.", "Demonstrates that the course is related to practical situations", "Simplifies difficult topics", "Summarizes lessons clearly and exhaustively.", "Is knowledgeable about the subject matter"] },
    { title: "TEACHING METHODOLOGY", questions: ["Uses different methods, not only tests, to evaluate student understanding.", "Challenges the students to do their best.", "Presents the class lessons in an understandable approach.", "Speaks in a clear and well-modulated voice", "Uses appropriate audiovisual materials in presenting the lesson.", "Provides course syllabi, references, PPTs, and other materials.", "Organizes resources and materials to teach effectively."] },
    { title: "CLASSROOM MANAGEMENT", questions: ["Uses systematic procedure to maintain order and discipline.", "Enforces orderliness in the classroom.", "Begins and ends the class on time.", "Devotes specific time for consultation with students.", "Commands respect of students in class.", "Checks and gives result of tests, exams, and assignments.", "Informs students about their grades every periodical period.", "Provides grade consultations"] },
    { title: "INTEGRITY", questions: ["Does not use position for personal gain.", "Is respected by the students", "Is honest and sincere in his/her actuations", "Is fair in giving grades and treats complaints on grades justly.", "Explains and follows criteria in the grading system"] }
  ],
  "Self Evaluation": [
    {
      title: "Self-Evaluation Rating",
      questions: [
        "I provide and maintain an environment and atmosphere of motivational learning for my students.",
        "I use techniques (reviews, summaries, etc) that make the objective(s) and contents of each lesson clear.",
        "I prepare effective techniques in asking questions, so that my students can use variety of cognitive responses.",
        "I provide oral and written seatwork, homework, performance tasks, and others to my students that are appropriate for our lessons and that require them to be analytical and critical.",
        "I maximize resources (physical, online, or blended) to enhance discussions.",
        "My clerical duties (attendance checking, recording of grades, etc.) are effectively done.",
        "I maximize teaching time.",
        "I am impartial with all my students.",
        "I return students' works timely and properly.",
        "I am available to help my students during our class time and other free time during the school day but inform them of the proper authorities to talk to if necessary.",
        "I am well prepared, ready to share factual information and ready to answer questions about the lesson.",
        "I understand that my behavior has effects not only toward my work but also with my colleagues.",
        "I go with optimism.",
        "I appreciate and recognize my students when they do good work and participate well.",
        "I befittingly correct my students' misbehavior with care, discipline, and respect.",
        "I get in touch with parent/guardian to ensure my student's needs and development are in place.",
        "I work on my professional development.",
        "I willingly accept extra duties given by proper college authorities.",
        "In good faith, I accept and respect administrative decisions and go through proper line of authorities to air my comments, suggestions, and/or feelings.",
        "I respect all administrators and personnel, properties, ideas, and principles being upheld by BTech.",
      ]
    }
  ],
  "Peer to Peer Evaluation": [
    {
      title: "Peer Evaluation Rating",
      questions: [
        "Uses current curricular and instructional materials that lead to effective teaching.",
        "Prompt in meeting deadlines.",
        "Shows punctuality in given schedules (class, meetings, seminars, etc.).",
        "Demonstrates effective oral and written communication skills (medium of instructions appropriate for the subject).",
        "Submits apt and proper syllabus or module.",
        "Prepares and submits assessment and examination copies as required by the program head and/or dean.",
        "Submits apt and proper student grades and grade-related documents.",
        "Is organized, creative, and neat in submitting required documents other than grade-related documents (Ex. minutes of the meeting, training documentation, reports, etc.).",
        "Demonstrates accuracy in submitted documents and record keeping.",
        "Demonstrates an understanding of the handled subject(s) by preparing, using, and submitting appropriate and correct instructional materials as required by the Program Director and/or the Dean.",
      ]
    }
  ],
  "Classroom Observation (Online)": [
    {
      title: "KNOWLEDGE AND ABILITY",
      questions: [
        "Shows evidence of preparation.", "Constructs clear, comprehensive and accurate explanations.", "Discusses the topics intelligently.",
        "Explains clearly the learning objectives of the lesson.", "Summarizes main points of the lesson.", "Relates lesson to actual situations/experiences.",
        "Integrates values in the lesson.", "Answers students' questions skillfully.", "Motivates students to ask questions.",
        "Stimulates critical and creative thinking.", "Gives clear directions and instructions.", "Maximizes the use of online platforms and resources.",
        "Adapts to students' learning paces.", "Shows mastery of the subject matter.",
      ]
    },
    {
      title: "SKILLS",
      questions: [
        "Speaks clearly and articulately.", "Manages online classroom time well.", "Uses appropriate instructional materials effectively.",
        "Facilitates interactive discussions smoothly.", "Provides timely feedback to students.", "Handles technical issues calmly and effectively.",
      ]
    },
    {
      title: "OTHER BEHAVIOR AND PERSONAL CHARACTERISTICS",
      questions: [
        "Shows enthusiasm in teaching.", "Maintains a professional appearance online.", "Demonstrates patience and understanding.",
        "Encourages a positive learning environment.", "Shows respect for students' opinions.", "Is approachable and accessible to students.",
        "Demonstrates fairness and objectivity.",
      ]
    }
  ]
};

// The Faculty Evaluation project's own Flask backend (kept separate from this
// central admin's backend). Override with VITE_FACULTY_EVAL_API_URL in .env
// if it's hosted somewhere other than localhost:5001.
const API = import.meta.env.VITE_FACULTY_EVAL_API_URL || 'http://localhost:5001/api';

const SUB_TABS = ['Dashboard', 'Evaluation Criteria', 'Evaluation Reports', 'Edit Questionnaires', 'Settings'];

const EvaluationAdmin = () => {
  const [evalActivePage, setEvalActivePage] = useState('Dashboard');
  const [formsData, setFormsData] = useState(initialFormsData);
  const [apiError, setApiError] = useState(false);

  useEffect(() => {
    fetch(`${API}/questionnaires/`)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.questionnaires.length > 0) {
          const loaded = {};
          data.questionnaires.forEach(q => { loaded[q.formType] = q.sections; });
          setFormsData(loaded);
        }
      })
      .catch(() => setApiError(true));
  }, []);

  // "View <FormType>" pages are reached via the Evaluation Criteria page's
  // "View" button, not through the sub-nav — same behavior as the standalone app.
  const isViewPage = evalActivePage.startsWith('View ');

  const renderContent = () => {
    switch (evalActivePage) {
      case 'Dashboard': return <Dashboard />;
      case 'Evaluation Criteria': return <EvaluationCriteria setActivePage={setEvalActivePage} />;
      case 'Evaluation Reports': return <EvaluationReports />;
      case 'Settings': return <Settings />;
      case 'Edit Questionnaires':
        return <EditQuestionnaire formsData={formsData} setFormsData={setFormsData} />;

      case 'View Student Evaluation':
        return <StudentEvaluation isViewOnly={true} setActivePage={setEvalActivePage} evaluationSections={formsData["Student Evaluation"]} />;
      case 'View Classroom/Teaching Observation (Online)':
        return <ClassroomObservationOnline setActivePage={setEvalActivePage} evaluationSections={formsData["Classroom Observation (Online)"]} />;
      case 'View Self Evaluation':
        return <SelfEvaluation setActivePage={setEvalActivePage} evaluationSections={formsData["Self Evaluation"]} />;
      case 'View Peer to Peer Evaluation':
        return <PeerEvaluation setActivePage={setEvalActivePage} evaluationSections={formsData["Peer to Peer Evaluation"]} />;

      default: return <Dashboard />;
    }
  };

  return (
    <div className="eval-admin-wrapper">
      {apiError && (
        <div className="eval-admin-warning no-print">
          Could not reach the Faculty Evaluation backend at <code>{API}</code>. Showing default questionnaire data — make sure the Flask server is running (<code>python app.py</code> in the Faculty Evaluation backend folder).
        </div>
      )}

      {!isViewPage && (
        <div className="eval-subnav no-print">
          {SUB_TABS.map(tab => (
            <button
              key={tab}
              className={`eval-subnav-btn ${evalActivePage === tab ? 'active' : ''}`}
              onClick={() => setEvalActivePage(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
      )}

      <div className="eval-admin-content">
        {renderContent()}
      </div>
    </div>
  );
};

export default EvaluationAdmin;
