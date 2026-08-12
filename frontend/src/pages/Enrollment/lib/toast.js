function showToast(message, type = "info") {
  if (typeof document === "undefined") return;

  let container = document.getElementById("enrollment-toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "enrollment-toast-container";
    Object.assign(container.style, {
      position: "fixed",
      top: "20px",
      right: "20px",
      zIndex: "9999",
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      maxWidth: "min(380px, calc(100vw - 32px))",
      pointerEvents: "none",
    });
    document.body.appendChild(container);
  }

  const item = document.createElement("div");
  const isError = type === "error";
  Object.assign(item.style, {
    borderRadius: "14px",
    border: `1px solid ${isError ? "#fecaca" : "#bbf7d0"}`,
    background: isError ? "#fff1f2" : "#f0fdf4",
    color: isError ? "#9f1239" : "#166534",
    boxShadow: "0 12px 35px rgba(15, 23, 42, 0.14)",
    padding: "12px 14px",
    fontSize: "14px",
    fontWeight: "600",
    lineHeight: "1.45",
    opacity: "0",
    transform: "translateY(-6px)",
    transition: "opacity .2s ease, transform .2s ease",
    pointerEvents: "auto",
  });
  item.textContent = String(message ?? "");
  container.appendChild(item);

  requestAnimationFrame(() => {
    item.style.opacity = "1";
    item.style.transform = "translateY(0)";
  });

  window.setTimeout(() => {
    item.style.opacity = "0";
    item.style.transform = "translateY(-6px)";
    window.setTimeout(() => item.remove(), 220);
  }, 3500);
}

const toast = {
  success(message) {
    showToast(message, "success");
  },
  error(message) {
    showToast(message, "error");
  },
};

export default toast;
