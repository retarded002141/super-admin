import os, re

base_dir = r'c:\Users\kenth\Downloads\super-admin\super-admin\frontend\src\pages\Pre-Admission\pages'

def fix_imports(content):
    content = re.sub(r'import\s+\{\s*useNavigate,\s*useLocation,\s*useOutletContext\s*\}\s*from\s*"react-router-dom";?\n?', '', content)
    content = re.sub(r'import\s+\{\s*useNavigate,\s*useOutletContext\s*\}\s*from\s*"react-router-dom";?\n?', '', content)
    content = re.sub(r'import\s+Sidebar\s+from\s+"../../components/admin/Sidebar.jsx";?\n?', '', content)
    content = re.sub(r'import\s+AdminHeader\s+from\s+"../../components/admin/AdminHeader";?\n?', '', content)
    content = re.sub(r'import\s+api(\,\s*\{\s*BASE_URL\s*\})?\s*from\s+"../../services/api";?', r'import api\1 from "../../../services/api.js";', content)
    content = re.sub(r'from\s+"../../context/ToastContext.jsx"', r'from "../components/Toast.jsx"', content)
    content = re.sub(r'from\s+"../../components/Loaders.jsx"', r'from "../components/Loaders.jsx"', content)
    content = re.sub(r'from\s+"../../services/adminService.js"', r'from "../../../services/adminService.js"', content)
    return content

def fix_component(filepath, comp_name):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    content = fix_imports(content)
    
    # Replace function signature and hooks
    content = re.sub(r'export default function ' + comp_name + r'\(\)\s*\{', f'export default function {comp_name}({{ navigateToTab, navigationState }}) {{', content)
    content = re.sub(r'const\s+\{\s*isSidebarOpen\s*\}\s*=\s*useOutletContext\(\);?', '', content)
    content = re.sub(r'const\s+navigate\s*=\s*useNavigate\(\);?', '', content)
    content = re.sub(r'const\s+location\s*=\s*useLocation\(\);?', '', content)
    
    # Replace navigate(...) with navigateToTab(...)
    # navigate('/admin_applications') -> navigateToTab('pre-admission-applications')
    content = re.sub(r'navigate\(\'/admin_applications\'\)', r"navigateToTab('pre-admission-applications')", content)
    content = re.sub(r'navigate\(\'/admin_post_admission\'\)', r"navigateToTab('pre-admission-admission')", content)
    # navigate('/admin_applications', { state: { ... } }) -> navigateToTab('pre-admission-applications', { ... })
    content = re.sub(r'navigate\(\'/admin_applications\',\s*\{\s*state:\s*(\{.*?\})\s*\}\)', r"navigateToTab('pre-admission-applications', \1)", content)
    
    # Replace location.state with navigationState
    content = re.sub(r'location\.state\?', r'(navigationState || {})', content)
    content = re.sub(r'location\.state', r'navigationState', content)
    content = re.sub(r'location\.pathname', r"''", content)
    
    # Remove <AdminHeader ... />
    content = re.sub(r'<AdminHeader\s+.*?/>', '', content)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

# Fix AdminDashboard.jsx and rename it to Dashboard.jsx
admin_dash = os.path.join(base_dir, 'AdminDashboard.jsx')
if os.path.exists(admin_dash):
    fix_component(admin_dash, 'AdminDashboard')
    dash = os.path.join(base_dir, 'Dashboard.jsx')
    if os.path.exists(dash):
        os.remove(dash)
    os.rename(admin_dash, dash)
    # Rename component name in Dashboard.jsx to Dashboard
    with open(dash, 'r', encoding='utf-8') as f:
        c = f.read()
    c = c.replace('export default function AdminDashboard(', 'export default function Dashboard(')
    with open(dash, 'w', encoding='utf-8') as f:
        f.write(c)

# Fix Applications.jsx
apps = os.path.join(base_dir, 'Applications.jsx')
if os.path.exists(apps):
    fix_component(apps, 'Applications')

# Fix PostAdmission.jsx if exists
post_adm = os.path.join(base_dir, 'PostAdmission.jsx')
if os.path.exists(post_adm):
    fix_component(post_adm, 'PostAdmission')
    
# Fix Pre-Admission.jsx if exists
pre_adm = os.path.join(base_dir, 'Pre-Admission.jsx')
if os.path.exists(pre_adm):
    fix_component(pre_adm, 'PreAdmission') # Or whatever the function name is

print("Done fixing files")
