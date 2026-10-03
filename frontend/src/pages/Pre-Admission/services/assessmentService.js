import api from "./api";

export const submitExam = (data) => api.post("/assessment/exam", data);
export const submitInterview = (data) => api.post("/assessment/interview", data);