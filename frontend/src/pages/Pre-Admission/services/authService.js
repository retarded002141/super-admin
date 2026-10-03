import api from "./api";

export const loginApplicant = (data) => api.post("/applicant/login", data);
export const registerApplicant = (data) => api.post("/applicant/register", data);
export const loginAdmin = (data) => api.post("/admin/login", data);