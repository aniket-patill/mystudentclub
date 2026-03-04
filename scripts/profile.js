const supabaseUrl = 'https://api.mystudentclub.com';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
pdfjsLib.GlobalWorkerOptions.workerSrc = '/scripts/vendor/pdf.worker.min.js';
const WORKER_URL = 'https://storer.bhansalimanan55.workers.dev';

// DOM refs
const profileForm   = document.getElementById('profile-form');
const loadingOverlay = document.getElementById('loading-overlay');
const saveBtn        = document.getElementById('saveBtn');
let currentUser      = null;
let lastUpdatedISO   = null;

const ENTRY_CLEAR_MAP = {
    'summary-entry-display': ['profile_summary', 'headline'],
    'edu-final-display': ['ca_final_course', 'ca_final_attempts_type', 'ca_final_attempts', 'ca_final_clear_month', 'ca_final_clear_year', 'ca_final_app_month', 'ca_final_app_year'],
    'edu-inter-display': ['ca_inter_course', 'ca_inter_attempts_type', 'ca_inter_attempts', 'ca_inter_clear_month', 'ca_inter_clear_year'],
    'edu-found-display': ['ca_found_course', 'ca_found_attempts_type', 'ca_found_attempts', 'ca_found_clear_month', 'ca_found_clear_year'],
    'edu-grad-display': ['grad_degree', 'grad_university', 'grad_year', 'grad_percentage'],
    'edu-12-display': ['class12_board', 'class12_school', 'class12_year', 'class12_percentage'],
    'edu-10-display': ['class10_board', 'class10_school', 'class10_year', 'class10_percentage'],
    'edu-other-display': ['other_edu_level', 'other_edu_course', 'other_edu_institute', 'other_edu_year', 'other_edu_score'],
    'emp-org-display': ['is_current_employment', 'employment_type', 'emp_exp_years', 'emp_exp_months', 'emp_company_name', 'emp_job_title', 'emp_join_year', 'emp_join_month', 'emp_salary_currency', 'emp_current_salary', 'emp_salary_breakdown', 'emp_skills_hidden', 'emp_job_profile', 'emp_notice_period'],
    'emp-art-display': ['articleship_firm_type', 'articleship_firm_name', 'articleship_domain', 'articleship_domain_other'],
    'emp-it-display': ['industrial_training_company']
};

const ENTRY_DEFAULT_VALUE_MAP = {
    is_current_employment: 'Yes',
    employment_type: 'Full-time',
    emp_salary_currency: 'INR',
    project_status: 'In progress'
};

// =================== MULTI-ENTRY: CERTIFICATIONS & PROJECTS ===================
let certificationsList = [];
let projectsList = [];
let certEditIndex = -1; // -1 means adding new
let projectEditIndex = -1;

function syncCertificationsHidden() {
    const el = document.getElementById('certifications_json');
    if (el) el.value = JSON.stringify(certificationsList);
}

function syncProjectsHidden() {
    const el = document.getElementById('projects_json');
    if (el) el.value = JSON.stringify(projectsList);
}

function clearCertForm() {
    ['cert_name', 'cert_issuer', 'cert_year', 'cert_url'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    certEditIndex = -1;
}

function clearProjectForm() {
    ['project_title', 'project_tag', 'project_client', 'project_worked_from_year', 'project_worked_from_month', 'project_details'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    // Reset radio to default
    const radios = document.querySelectorAll('input[name="project_status"]');
    radios.forEach(r => r.checked = r.value === 'In progress');
    projectEditIndex = -1;
}

function loadCertIntoForm(cert) {
    document.getElementById('cert_name').value = cert.cert_name || '';
    document.getElementById('cert_issuer').value = cert.cert_issuer || '';
    document.getElementById('cert_year').value = cert.cert_year || '';
    document.getElementById('cert_url').value = cert.cert_url || '';
}

function loadProjectIntoForm(proj) {
    document.getElementById('project_title').value = proj.project_title || '';
    document.getElementById('project_tag').value = proj.project_tag || '';
    document.getElementById('project_client').value = proj.project_client || '';
    document.getElementById('project_worked_from_year').value = proj.project_worked_from_year || '';
    document.getElementById('project_worked_from_month').value = proj.project_worked_from_month || '';
    document.getElementById('project_details').value = proj.project_details || '';
    const radios = document.querySelectorAll('input[name="project_status"]');
    radios.forEach(r => r.checked = r.value === (proj.project_status || 'In progress'));
    // Update char count
    const left = 1000 - (proj.project_details || '').length;
    const leftEl = document.getElementById('project-details-left');
    if (leftEl) leftEl.textContent = Math.max(0, left);
}

function readCertFromForm() {
    return {
        cert_name: (document.getElementById('cert_name').value || '').trim(),
        cert_issuer: (document.getElementById('cert_issuer').value || '').trim(),
        cert_year: (document.getElementById('cert_year').value || '').trim(),
        cert_url: (document.getElementById('cert_url').value || '').trim()
    };
}

function readProjectFromForm() {
    const statusRadio = document.querySelector('input[name="project_status"]:checked');
    return {
        project_title: (document.getElementById('project_title').value || '').trim(),
        project_tag: (document.getElementById('project_tag').value || '').trim(),
        project_client: (document.getElementById('project_client').value || '').trim(),
        project_status: statusRadio ? statusRadio.value : 'In progress',
        project_worked_from_year: (document.getElementById('project_worked_from_year').value || '').trim(),
        project_worked_from_month: (document.getElementById('project_worked_from_month').value || '').trim(),
        project_details: (document.getElementById('project_details').value || '').trim()
    };
}

function saveCertEntry() {
    const data = readCertFromForm();
    if (!data.cert_name) return; // require at least a name
    if (certEditIndex >= 0 && certEditIndex < certificationsList.length) {
        certificationsList[certEditIndex] = data;
    } else {
        certificationsList.push(data);
    }
    syncCertificationsHidden();
    clearCertForm();
    refreshHeader();
}

function saveProjectEntry() {
    const data = readProjectFromForm();
    if (!data.project_title) return;
    if (projectEditIndex >= 0 && projectEditIndex < projectsList.length) {
        projectsList[projectEditIndex] = data;
    } else {
        projectsList.push(data);
    }
    syncProjectsHidden();
    clearProjectForm();
    refreshHeader();
}

function removeCertEntry(idx) {
    certificationsList.splice(idx, 1);
    syncCertificationsHidden();
    refreshHeader();
}

function removeProjectEntry(idx) {
    projectsList.splice(idx, 1);
    syncProjectsHidden();
    refreshHeader();
}

// File configs
const fileConfig = {
    resume: {
        input: document.getElementById('resume'),
        dropZone: document.getElementById('resumeDropZone'),
        displayArea: document.getElementById('resume-display-area'),
        filenameEl: document.getElementById('resume-filename'),
        uploadArea: document.getElementById('resume-upload-area'),
        storageKeyText: 'userCVText',
        storageKeyName: 'userCVFileName',
        storageKeyImages: 'userCVImages'
    },
    cover_letter: {
        input: document.getElementById('cover_letter'),
        dropZone: document.getElementById('coverLetterDropZone'),
        displayArea: document.getElementById('cover-letter-display-area'),
        filenameEl: document.getElementById('cover-letter-filename'),
        uploadArea: document.getElementById('cover-letter-upload-area'),
        storageKeyText: 'userCoverLetterText',
        storageKeyName: 'userCoverLetterFileName'
    }
};

// =================== AUTH ===================
async function checkAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session || !session.user) {
        window.location.href = '/login.html';
        return null;
    }
    currentUser = session.user;
    return session.user;
}

// =================== LOADING ===================
function showLoading(visible, text = 'Loading...') {
    if (visible) {
        loadingOverlay.querySelector('p').textContent = text;
        loadingOverlay.style.display = 'flex';
    } else {
        loadingOverlay.style.display = 'none';
    }
}

// =================== PROFILE LOAD ===================
async function loadProfile() {
    if (!currentUser) return null;
    showLoading(true, 'Fetching your profile...');
    let profileData = null;

    try {
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('profile, ocr_cv, updated_at')
            .eq('uuid', currentUser.id)
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        if (data) {
            lastUpdatedISO = data.updated_at;
            if (data.profile) {
                profileData = data.profile;
                populateForm(profileData);
                localStorage.setItem('userProfileData', JSON.stringify(profileData));
            }
            if (data.ocr_cv) {
                localStorage.setItem('userCVText', data.ocr_cv);
            }
            // Restore resume/cover-letter filenames from Supabase
            if (profileData) {
                if (profileData._resume_filename) {
                    localStorage.setItem('userCVFileName', profileData._resume_filename);
                    showFileDisplay('resume', profileData._resume_filename);
                }
                if (profileData._cover_letter_filename) {
                    localStorage.setItem('userCoverLetterFileName', profileData._cover_letter_filename);
                    showFileDisplay('cover_letter', profileData._cover_letter_filename);
                }
            }
        } else {
            const localProfile = localStorage.getItem('userProfileData');
            if (localProfile) {
                profileData = JSON.parse(localProfile);
                populateForm(profileData);
            }
        }

        // Show cached files (localStorage fallback)
        ['resume', 'cover_letter'].forEach(type => {
            const config = fileConfig[type];
            if (type === 'resume') {
                const cachedImages = localStorage.getItem(config.storageKeyImages);
                const cachedName = localStorage.getItem(config.storageKeyName);
                if (cachedImages && cachedName) showFileDisplay(type, cachedName);
            } else {
                const cachedName = localStorage.getItem(config.storageKeyName);
                if (cachedName) showFileDisplay(type, cachedName);
            }
        });

        setTimeout(() => refreshHeader(), 150);

    } catch (e) {
        console.error(e);
        const localProfile = localStorage.getItem('userProfileData');
        if (localProfile) {
            profileData = JSON.parse(localProfile);
            populateForm(profileData);
        }
        setTimeout(() => refreshHeader(), 150);
    } finally {
        showLoading(false);
    }
    return profileData;
}

// =================== POPULATE FORM ===================
function populateForm(profileData) {
    if (!profileData) return;

    for (const key in profileData) {
        if (key === 'resume' || key === 'cover_letter' || key === 'project_attachment') continue;
        if (key.startsWith('_')) continue; // skip internal metadata keys like _resume_filename
        // Skip multi-entry JSON fields — handled separately below
        if (key === 'certifications_json' || key === 'projects_json') continue;

        const field = profileForm.elements[key];
        if (!field) continue;

        // Handle RadioNodeList (multiple radio buttons with same name)
        if (typeof field.length !== 'undefined' && field.length > 1 && field[0] && field[0].type === 'radio') {
            for (let i = 0; i < field.length; i++) {
                field[i].checked = (field[i].value === profileData[key]);
            }
        } else {
            field.value = profileData[key];
        }
    }

    // --- Sync employment type chip UI ---
    syncEmploymentChipSelection();

    // --- Rebuild skill tags from hidden input ---
    const skillsHiddenVal = (profileData.emp_skills_hidden || '').trim();
    if (skillsHiddenVal) {
        const skillsHidden = document.getElementById('emp_skills_hidden');
        if (skillsHidden) {
            skillsHidden.value = skillsHiddenVal;
            skillsHidden.dispatchEvent(new Event('rebuildSkills'));
        }
    }

    const domainOther = document.getElementById('articleship_domain_other');
    const domainOtherGroup = document.getElementById('articleship_domain_other_group');
    if (domainOther && profileData.articleship_domain === 'Other') {
        if (domainOtherGroup) domainOtherGroup.style.display = 'block';
    }

    const jobPref = document.getElementById('job_preference');
    if (jobPref) jobPref.dispatchEvent(new Event('change'));

    // --- Trigger attempts dropdowns for conditional count fields ---
    ['ca_final_attempts_type', 'ca_inter_attempts_type', 'ca_found_attempts_type'].forEach(id => {
        const dd = document.getElementById(id);
        if (dd && dd.value) dd.dispatchEvent(new Event('change'));
    });

    // Backward compatibility: old headline field maps to profile_summary if empty.
    const summaryField = document.getElementById('profile_summary');
    if (summaryField && !summaryField.value && profileData.headline) {
        summaryField.value = profileData.headline;
    }
    const headlineField = document.getElementById('headline');
    if (headlineField && summaryField) {
        headlineField.value = summaryField.value || '';
    }

    // --- Multi-entry: Certifications ---
    if (profileData.certifications_json) {
        try {
            const parsed = JSON.parse(profileData.certifications_json);
            if (Array.isArray(parsed) && parsed.length) {
                certificationsList = parsed;
            }
        } catch (e) { /* ignore */ }
    }
    // Backward compat: migrate old single-field cert data
    if (!certificationsList.length && (profileData.cert_name || '').trim()) {
        certificationsList.push({
            cert_name: (profileData.cert_name || '').trim(),
            cert_issuer: (profileData.cert_issuer || '').trim(),
            cert_year: (profileData.cert_year || '').trim(),
            cert_url: (profileData.cert_url || '').trim()
        });
    }
    syncCertificationsHidden();

    // --- Multi-entry: Projects ---
    if (profileData.projects_json) {
        try {
            const parsed = JSON.parse(profileData.projects_json);
            if (Array.isArray(parsed) && parsed.length) {
                projectsList = parsed;
            }
        } catch (e) { /* ignore */ }
    }
    // Backward compat: migrate old single-field project data
    if (!projectsList.length && (profileData.project_title || '').trim()) {
        projectsList.push({
            project_title: (profileData.project_title || '').trim(),
            project_tag: (profileData.project_tag || '').trim(),
            project_client: (profileData.project_client || '').trim(),
            project_status: (profileData.project_status || 'In progress').trim(),
            project_worked_from_year: (profileData.project_worked_from_year || '').trim(),
            project_worked_from_month: (profileData.project_worked_from_month || '').trim(),
            project_details: (profileData.project_details || '').trim()
        });
    }
    syncProjectsHidden();
}

// =================== FILE HANDLING ===================
function showFileDisplay(type, filename) {
    const config = fileConfig[type];
    if (!config) return;
    config.filenameEl.textContent = filename;
    config.displayArea.style.display = 'block';
    config.uploadArea.style.display = 'none';
}

function hideFileDisplay(type) {
    const config = fileConfig[type];
    if (!config) return;
    config.filenameEl.textContent = '';
    config.displayArea.style.display = 'none';
    config.uploadArea.style.display = 'block';
    localStorage.removeItem(config.storageKeyText);
    localStorage.removeItem(config.storageKeyName);
    if (config.storageKeyImages) localStorage.removeItem(config.storageKeyImages);
    config.input.value = '';
}

function showProjectFileDisplay(filename) {
    const filenameEl = document.getElementById('project-filename');
    const hiddenInput = document.getElementById('project_attachment_name');
    const display = document.getElementById('project-file-display');
    if (filenameEl) filenameEl.textContent = filename;
    if (hiddenInput) hiddenInput.value = filename || '';
    if (display) display.style.display = filename ? 'block' : 'none';
}

function hideProjectFileDisplay() {
    const fileInput = document.getElementById('project_attachment');
    const filenameEl = document.getElementById('project-filename');
    const hiddenInput = document.getElementById('project_attachment_name');
    const display = document.getElementById('project-file-display');
    if (fileInput) fileInput.value = '';
    if (filenameEl) filenameEl.textContent = '';
    if (hiddenInput) hiddenInput.value = '';
    if (display) display.style.display = 'none';
}

function clearFormValueByName(name) {
    const nodes = profileForm.querySelectorAll(`[name="${name}"]`);
    if (!nodes.length) return;

    if (nodes.length > 1 && nodes[0].type === 'radio') {
        nodes.forEach(n => n.checked = false);
        const defaultValue = ENTRY_DEFAULT_VALUE_MAP[name];
        if (defaultValue) {
            const defaultNode = [...nodes].find(n => n.value === defaultValue);
            if (defaultNode) defaultNode.checked = true;
        }
        return;
    }

    const field = nodes[0];
    const defaultValue = ENTRY_DEFAULT_VALUE_MAP[name];

    if (field.tagName === 'SELECT') {
        field.value = defaultValue || '';
    } else if (field.type === 'checkbox' || field.type === 'radio') {
        field.checked = !!defaultValue;
    } else {
        field.value = defaultValue || '';
    }
}

function syncEmploymentChipSelection() {
    document.querySelectorAll('#emp_type_chips .p2-chip').forEach(chip => {
        const radio = chip.querySelector('input[type="radio"]');
        chip.classList.toggle('selected', !!(radio && radio.checked));
    });
}

function clearEntryData(entryId) {
    const fields = ENTRY_CLEAR_MAP[entryId] || [];
    fields.forEach(clearFormValueByName);

    if (entryId === 'emp-org-display') {
        // Clear skills using existing handlers so internal list also resets.
        let closeIcon = document.querySelector('.p2-skill-tag i');
        while (closeIcon) {
            closeIcon.click();
            closeIcon = document.querySelector('.p2-skill-tag i');
        }
        const skillsHidden = document.getElementById('emp_skills_hidden');
        if (skillsHidden) skillsHidden.value = '';
        const skillsInput = document.getElementById('skills_input');
        if (skillsInput) skillsInput.value = '';
        syncEmploymentChipSelection();
    }

    if (entryId === 'summary-entry-display') {
        const summaryInput = document.getElementById('profile_summary');
        const summaryLeft = document.getElementById('summary-left');
        const headlineHidden = document.getElementById('headline');
        if (summaryInput) summaryInput.value = '';
        if (headlineHidden) headlineHidden.value = '';
        if (summaryLeft) summaryLeft.textContent = '1000';
    }

    refreshHeader();
}

function attachEntryRemoveButtons() {
    document.querySelectorAll('.p2-saved-entry .p2-entry-edit[data-toggle]').forEach(editLink => {
        const header = editLink.closest('.p2-saved-entry-header');
        const entry = editLink.closest('.p2-saved-entry');
        if (!header || !entry) return;

        let actionsWrap = header.querySelector('.p2-entry-actions');
        if (!actionsWrap) {
            actionsWrap = document.createElement('div');
            actionsWrap.className = 'p2-entry-actions';
            header.appendChild(actionsWrap);
        }

        if (!actionsWrap.contains(editLink)) {
            actionsWrap.appendChild(editLink);
        }

        if (actionsWrap.querySelector('.p2-entry-remove')) return;

        const removeBtn = document.createElement('a');
        removeBtn.href = 'javascript:void(0)';
        removeBtn.className = 'p2-entry-remove';
        removeBtn.setAttribute('title', 'Remove');
        removeBtn.setAttribute('data-entry-id', entry.id);
        removeBtn.innerHTML = '<i class="fas fa-times"></i>';

        actionsWrap.insertBefore(removeBtn, editLink);
    });
}

async function handleFile(file, type) {
    if (!file) return;
    const config = fileConfig[type];
    if (!config) return;

    showLoading(true, `Processing ${type.replace('_', ' ')}...`);
    try {
        let textContent = '';
        let images = [];

        if (type === 'cover_letter' && file.type !== 'application/pdf') {
            alert('Please upload your Cover Letter in PDF format only.');
            return;
        }

        if (file.type === 'application/pdf') {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const text = await page.getTextContent();
                textContent += text.items.map(s => s.str).join(' ');
            }

            if (type === 'resume') {
                showLoading(true, 'Converting resume to images...');
                images = await convertPdfToImages(pdf);
                if (images.length > 0) {
                    try {
                        localStorage.setItem(config.storageKeyImages, JSON.stringify(images));
                    } catch (e) {
                        alert('Resume is too large. Please reupload your resume.');
                    }
                    showLoading(true, 'Validating and Autofilling details...');
                    const extractResult = await extractProfileData(images, textContent);
                    if (extractResult && extractResult.is_valid === false) {
                        alert(extractResult.message);
                        hideFileDisplay('resume');
                        return;
                    } else if (extractResult && extractResult.data) {
                        populateForm(extractResult.data);
                        refreshHeader();
                        alert('Profile auto-filled from your resume! Please review the details.');
                    }
                }
            }
        } else if (file.type === 'text/plain') {
            textContent = await file.text();
            if (type === 'resume') {
                localStorage.setItem(config.storageKeyImages, JSON.stringify([]));
                showLoading(true, 'Validating and Autofilling details...');
                const extractResult = await extractProfileData([], textContent);
                if (extractResult && extractResult.is_valid === false) {
                    alert(extractResult.message);
                    hideFileDisplay('resume');
                    return;
                } else if (extractResult && extractResult.data) {
                    populateForm(extractResult.data);
                    refreshHeader();
                    alert('Profile auto-filled from your resume! Please review the details.');
                }
            }
        } else {
            alert('Unsupported file type. Please upload PDF or TXT.');
            return;
        }

        localStorage.setItem(config.storageKeyText, textContent);
        localStorage.setItem(config.storageKeyName, file.name);
        showFileDisplay(type, file.name);
        refreshHeader();
    } catch (error) {
        console.error(error);
        alert(`Could not process your ${type.replace('_', ' ')}. Please try a different file.`);
    } finally {
        showLoading(false);
    }
}

async function convertPdfToImages(pdf) {
    const images = [];
    try {
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            await page.render({ canvasContext: context, viewport }).promise;
            images.push(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]);
        }
    } catch (e) {
        console.error(e);
    }
    return images;
}

async function extractProfileData(images, text) {
    if (!currentUser) return null;
    try {
        const response = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUser.id, images, pdf_text: text })
        });
        if (!response.ok) return null;
        const data = await response.json();
        if (data.ok && data.is_cv === false) {
            return { is_valid: false, message: data.message };
        }
        if (data.ok && data.response) {
            const parsed = parseGeminiJson(data.response);
            if (parsed.is_valid_cv === false) {
                return { is_valid: false, message: 'The uploaded file does not appear to be a valid Resume/CV.' };
            }
            return { is_valid: true, data: parsed };
        }
    } catch (e) {
        console.error(e);
    }
    return null;
}

function parseGeminiJson(text) {
    try {
        return JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
    } catch (e) {
        return null;
    }
}

function setCloudSyncFlag() {
    localStorage.setItem('cv_cloud_synced', 'true');
    document.cookie = 'cv_cloud_synced=true; max-age=31536000; path=/';
}

// =================== SAVE ===================

// Core save logic — reusable from both main Save and section-level Save buttons
async function saveProfileToCloud({ silent = false } = {}) {
    if (!currentUser) return;

    const summaryField = document.getElementById('profile_summary');
    const headlineField = document.getElementById('headline');
    if (headlineField && summaryField) {
        headlineField.value = (summaryField.value || '').trim();
    }

    const btnText = saveBtn.querySelector('.btn-text');
    const spinner = saveBtn.querySelector('.fa-spinner');
    const originalText = btnText.textContent;
    btnText.textContent = 'Saving...';
    spinner.style.display = 'inline-block';
    saveBtn.disabled = true;

    const formData = new FormData(profileForm);
    const profileData = Object.fromEntries(formData.entries());
    delete profileData.resume;
    delete profileData.cover_letter;

    // Persist file metadata so filenames survive logout/login
    const resumeName = localStorage.getItem('userCVFileName');
    const coverName = localStorage.getItem('userCoverLetterFileName');
    if (resumeName) profileData._resume_filename = resumeName;
    if (coverName) profileData._cover_letter_filename = coverName;

    const ocrText = localStorage.getItem('userCVText') || '';
    localStorage.setItem('userProfileData', JSON.stringify(profileData));

    try {
        const { error } = await supabaseClient.from('profiles').upsert({
            uuid: currentUser.id,
            profile: profileData,
            ocr_cv: ocrText,
            updated_at: new Date().toISOString()
        });
        if (error) throw error;
        setCloudSyncFlag();
        lastUpdatedISO = new Date().toISOString();
        refreshHeader();
        if (!silent) alert('Profile saved successfully!');

        const redirectUrl = new URLSearchParams(window.location.search).get('redirect');
        if (redirectUrl) window.location.href = decodeURIComponent(redirectUrl);
    } catch (e) {
        console.error(e);
        if (!silent) alert('Profile saved to your browser, but failed to sync to the server. You can continue using the site.');
    } finally {
        btnText.textContent = originalText;
        spinner.style.display = 'none';
        saveBtn.disabled = false;
    }
}

// Main Save Profile button handler
async function handleSave(e) {
    e.preventDefault();
    const hasLocalResume = !!localStorage.getItem('userCVImages');
    const hasCloudProfile = !!localStorage.getItem('userProfileData');
    if (!hasLocalResume && !hasCloudProfile) {
        alert('Please upload your resume. It is required to use the AI features.');
        return;
    }
    await saveProfileToCloud({ silent: false });
}

function refreshHeader() {
    const fd = new FormData(profileForm);
    const d = {};
    for (const [k, v] of fd.entries()) d[k] = v;

    // Name + avatar
    const nameVal = (d.name || '').trim();
    document.getElementById('displayName').textContent = nameVal || 'Your Name';
    document.getElementById('avatarImg').src =
        `https://ui-avatars.com/api/?name=${encodeURIComponent(nameVal || 'U')}&background=e8e8e8&color=555&size=96&bold=true`;

    // Header details
    document.getElementById('hdLocation').textContent = d.current_location || 'Add location';
    document.getElementById('hdPhone').textContent = d.contact_number || 'Add mobile number';
    document.getElementById('hdExperience').textContent = d.total_experience || 'Fresher';
    document.getElementById('hdEmail').textContent = d.email || (currentUser ? currentUser.email : 'Add email');
    document.getElementById('hdNotice').textContent = d.notice_period || 'Add availability to join';
    const summaryVal = (d.profile_summary || d.headline || '').trim();
    const hdSummaryWrap = document.getElementById('hdSummaryWrap');
    const hdSummaryText = document.getElementById('hdSummaryText');
    if (hdSummaryWrap && hdSummaryText) {
        if (summaryVal) {
            hdSummaryWrap.style.display = 'block';
            hdSummaryText.textContent = summaryVal.length > 260 ? `${summaryVal.slice(0, 260)}...` : summaryVal;
        } else {
            hdSummaryWrap.style.display = 'none';
            hdSummaryText.textContent = '';
        }
    }

    // Last updated
    if (lastUpdatedISO) {
        const dt = new Date(lastUpdatedISO);
        const day = dt.getDate().toString().padStart(2, '0');
        const mon = dt.toLocaleString('default', { month: 'short' });
        const yr = dt.getFullYear();
        document.querySelector('#lastUpdated span').textContent = `${day}${mon}, ${yr}`;
    }

    // ---- Completeness calc ----
    const pref = d.job_preference || '';
    const needsCTC = ['fresher_experienced', 'semi_experienced'].includes(pref);
    const hasEducation = !!(
        (d.ca_final_course || '').trim() ||
        (d.ca_inter_course || '').trim() ||
        (d.ca_found_course || '').trim() ||
        (d.grad_degree || '').trim() ||
        (d.class12_board || '').trim() ||
        (d.class10_board || '').trim() ||
        (d.other_edu_course || '').trim() ||
        (d.other_edu_level || '').trim()
    );
    const hasExperience = !!(
        (d.total_experience || '').trim() ||
        (d.emp_company_name || '').trim() ||
        (d.emp_job_title || '').trim() ||
        (d.emp_exp_years || '').trim() ||
        (d.emp_exp_months || '').trim() ||
        (d.articleship_firm_name || '').trim() ||
        ((d.articleship_firm_type || '').trim() && (d.articleship_firm_type || '').trim() !== 'None') ||
        (d.industrial_training_company || '').trim()
    );
    const hasCurrentOrg = !!(
        (d.emp_company_name || '').trim() ||
        (d.articleship_firm_name || '').trim() ||
        (d.industrial_training_company || '').trim()
    );

    // Define tracked items: { label, icon, filled, boost }
    const items = [
        { label: 'Add full name',       icon: 'fa-user',         filled: !!nameVal,                                      boost: 10 },
        { label: 'Add mobile number',   icon: 'fa-phone-alt',    filled: !!(d.contact_number || '').trim(),               boost: 10 },
        { label: 'Add location',        icon: 'fa-map-marker-alt', filled: !!(d.current_location || '').trim(),           boost: 2  },
        { label: 'Add resume',          icon: 'fa-file-alt',     filled: !!localStorage.getItem('userCVText'),            boost: 10 },
        { label: 'Add profile summary', icon: 'fa-heading',      filled: !!((d.profile_summary || d.headline || '').trim()), boost: 8  },
        { label: 'Add CA education',    icon: 'fa-graduation-cap', filled: hasEducation,                                   boost: 10 },
        { label: 'Add experience',      icon: 'fa-briefcase',    filled: hasExperience,                                    boost: 10 },
        { label: 'Add notice period',   icon: 'fa-calendar-check', filled: !!(d.notice_period || '').trim(),              boost: 5  },
        { label: 'Add current organization', icon: 'fa-building', filled: hasCurrentOrg,                                   boost: 5 },
        { label: 'Add job preference',  icon: 'fa-bullseye',     filled: !!pref,                                          boost: 5  },
    ];

    if (needsCTC) {
        items.push({ label: 'Add current CTC', icon: 'fa-wallet', filled: !!(d.current_ctc || '').trim(), boost: 3 });
    }

    const totalBoost = items.reduce((s, i) => s + i.boost, 0);
    const filledBoost = items.filter(i => i.filled).reduce((s, i) => s + i.boost, 0);
    const pct = Math.round((filledBoost / totalBoost) * 100);
    const missing = items.filter(i => !i.filled);

    // Progress ring
    const circumference = 2 * Math.PI * 54; // r=54
    const offset = circumference - (circumference * pct / 100);
    document.getElementById('progressRing').style.strokeDashoffset = offset;
    document.getElementById('pctText').textContent = pct;

    // Change ring color based on %
    const ring = document.getElementById('progressRing');
    if (pct >= 80) ring.style.stroke = '#16A34A';      // green
    else if (pct >= 50) ring.style.stroke = '#457EFF';  // blue
    else ring.style.stroke = '#F97316';                  // orange

    // Badge color
    const badge = document.getElementById('pctBadge');
    if (pct >= 80) badge.style.color = '#16A34A';
    else if (pct >= 50) badge.style.color = '#457EFF';
    else badge.style.color = '#F97316';

    // Missing card
    const missingList = document.getElementById('missingList');
    const missingCta = document.getElementById('missingCta');
    const missingCard = document.getElementById('missingCard');

    if (missing.length === 0) {
        missingCard.style.display = 'none';
    } else {
        missingCard.style.display = 'flex';
        missingList.innerHTML = missing.slice(0, 4).map(m =>
            `<div class="p2-missing-row">
                <i class="fas ${m.icon}"></i>
                <span>${m.label}</span>
                <span class="p2-boost-sm">↑ ${m.boost}%</span>
            </div>`
        ).join('');
        document.getElementById('missingCount').textContent = missing.length;
    }

    // Update quick-link actions
    document.querySelectorAll('.p2-ql').forEach(link => {
        const hrefTarget = link.getAttribute('href');
        const actionSpan = link.querySelector('.p2-ql-action');
        if (!actionSpan) return;
        let filled = false;
        if (hrefTarget === '#sec-resume') filled = !!localStorage.getItem('userCVText');
        else if (hrefTarget === '#sec-headline') filled = !!((d.profile_summary || d.headline || '').trim());
        else if (hrefTarget === '#sec-ca-education') filled = !!((d.ca_final_course || '') + (d.ca_inter_course || '') + (d.ca_found_course || '') + (d.grad_degree || '') + (d.class12_board || '') + (d.class10_board || '') + (d.other_edu_course || '')).trim();
        else if (hrefTarget === '#sec-experience') filled = !!(
            (d.total_experience || '').trim() ||
            (d.emp_company_name || '').trim() ||
            (d.emp_job_title || '').trim() ||
            (d.emp_exp_years || '').trim() ||
            (d.emp_exp_months || '').trim() ||
            (d.articleship_firm_name || '').trim() ||
            ((d.articleship_firm_type || '').trim() && (d.articleship_firm_type || '').trim() !== 'None') ||
            (d.industrial_training_company || '').trim()
        );
        else if (hrefTarget === '#sec-projects') filled = projectsList.length > 0;
        else if (hrefTarget === '#sec-career') filled = !!((d.job_preference || '') + (d.current_industry || '') + (d.department || '') + (d.role_category || '') + (d.job_role || '') + (d.desired_job_type || '') + (d.desired_employment_type || '') + (d.preferred_shift || '') + (d.preferred_locations || '') + (d.expected_salary || '')).trim();
        else if (hrefTarget === '#sec-certification') filled = certificationsList.length > 0;
        else if (hrefTarget === '#sec-personal') filled = !!nameVal;

        if (filled) {
            actionSpan.textContent = 'Edit';
            actionSpan.style.color = '#16A34A';
        } else {
            actionSpan.textContent = hrefTarget === '#sec-resume' ? 'Upload' : 'Add';
            actionSpan.style.color = '';
        }
    });

    // Refresh saved data displays
    refreshSavedDisplays(d);
}

// ============================================
// SAVED DISPLAYS — Education & Employment
// ============================================
function refreshSavedDisplays(d) {
    // --- PERSONAL DETAILS ---
    const setPersonalValue = (id, value, fallback) => {
        const el = document.getElementById(id);
        if (!el) return;
        const val = (value || '').toString().trim();
        el.textContent = val || fallback;
        el.style.color = val ? 'var(--p2-text)' : 'var(--p2-blue)';
    };

    const gender = (d.gender || '').trim();
    const marital = (d.marital_status || '').trim();
    const personalParts = [gender && gender.toLowerCase(), marital].filter(Boolean);
    setPersonalValue('pd-personal', personalParts.join(', '), 'Add more info');

    let dobText = '';
    if ((d.date_of_birth || '').trim()) {
        const dt = new Date(d.date_of_birth);
        if (!Number.isNaN(dt.getTime())) {
            const day = dt.getDate().toString().padStart(2, '0');
            const mon = dt.toLocaleString('default', { month: 'short' });
            const yr = dt.getFullYear();
            dobText = `${day} ${mon} ${yr}`;
        }
    }
    setPersonalValue('pd-dob', dobText, 'Add date of birth');
    setPersonalValue('pd-category', d.category, 'Add Category');
    setPersonalValue('pd-work-permit', d.work_permit, 'Add Work permit');
    setPersonalValue('pd-address', d.address, 'Add Address');

    const langBody = document.getElementById('pd-lang-body');
    if (langBody) {
        const raw = (d.languages_json || '').trim();
        const rows = raw
            ? raw.split(',').map(s => s.trim()).filter(Boolean).map(item => {
                const parts = item.split('|').map(p => p.trim());
                return {
                    language: parts[0] || '',
                    proficiency: parts[1] || '',
                    read: parts[2] === '1',
                    write: parts[3] === '1',
                    speak: parts[4] === '1'
                };
            }).filter(r => r.language)
            : [];

        if (!rows.length) {
            langBody.innerHTML = '<tr><td colspan="5" class="p2-lang-empty">Add languages</td></tr>';
        } else {
            langBody.innerHTML = rows.map(r => `
                <tr>
                    <td>${r.language}</td>
                    <td>${r.proficiency || '-'}</td>
                    <td>${r.read ? '<i class="fas fa-check"></i>' : ''}</td>
                    <td>${r.write ? '<i class="fas fa-check"></i>' : ''}</td>
                    <td>${r.speak ? '<i class="fas fa-check"></i>' : ''}</td>
                </tr>
            `).join('');
        }
    }

    // --- PROFILE SUMMARY ---
    const summaryVal = (d.profile_summary || d.headline || '').trim();
    const summaryEntry = document.getElementById('summary-entry-display');
    const summaryTextDisplay = document.getElementById('summary-text-display');
    const summaryBoost = document.getElementById('summaryBoost');
    const summaryEditToggle = document.getElementById('summaryEditToggle');
    if (summaryVal) {
        if (summaryEntry) summaryEntry.style.display = 'block';
        if (summaryTextDisplay) summaryTextDisplay.textContent = summaryVal;
        if (summaryBoost) summaryBoost.style.display = 'none';
        if (summaryEditToggle) summaryEditToggle.textContent = 'Edit profile summary';
    } else {
        if (summaryEntry) summaryEntry.style.display = 'none';
        if (summaryBoost) summaryBoost.style.display = 'inline-block';
        if (summaryEditToggle) summaryEditToggle.textContent = 'Add profile summary';
    }

    // --- CERTIFICATION (MULTI-ENTRY) ---
    const certDisplay = document.getElementById('cert-display');
    const certEditToggle = document.getElementById('certEditToggle');
    if (certDisplay) {
        certDisplay.innerHTML = '';
        certificationsList.forEach((cert, idx) => {
            const name = (cert.cert_name || '').trim();
            const issuer = (cert.cert_issuer || '').trim();
            const year = (cert.cert_year || '').trim();
            const url = (cert.cert_url || '').trim();
            if (!name && !issuer && !year) return;
            const meta = [issuer, year, url].filter(Boolean).join(' | ');
            const entry = document.createElement('div');
            entry.className = 'p2-saved-entry';
            entry.innerHTML = `
                <div class="p2-saved-entry-header">
                    <div>
                        <div class="p2-saved-title">${name || 'Certification'}</div>
                        <div class="p2-saved-meta">${meta}</div>
                    </div>
                    <div class="p2-entry-actions">
                        <a href="javascript:void(0)" class="p2-entry-remove" title="Remove" data-cert-remove="${idx}"><i class="fas fa-times"></i></a>
                        <a href="javascript:void(0)" class="p2-entry-edit" data-cert-edit="${idx}"><i class="fas fa-pencil-alt"></i></a>
                    </div>
                </div>
            `;
            certDisplay.appendChild(entry);
        });
    }
    if (certEditToggle) {
        certEditToggle.textContent = certificationsList.length ? 'Add more' : 'Add';
    }

    // --- EDUCATION ---

    // CA Final display
    const finalCourse = (d.ca_final_course || '').trim();
    const finalDisplay = document.getElementById('edu-final-display');
    const addFinalLink = document.getElementById('addFinalLink');
    if (finalCourse) {
        finalDisplay.style.display = 'block';
        document.getElementById('edu-final-title').textContent = finalCourse;
        let metaParts = [];
        const pref = d.job_preference || '';
        if (['articleship', 'industrial'].includes(pref)) {
            const appMonth = (d.ca_final_app_month || '').trim();
            const appYear = (d.ca_final_app_year || '').trim();
            metaParts.push('Pursuing');
            if (appMonth && appYear) metaParts.push(`Expected: ${appMonth} ${appYear}`);
        } else {
            const clearMonth = (d.ca_final_clear_month || '').trim();
            const clearYear = (d.ca_final_clear_year || '').trim();
            const attType = (d.ca_final_attempts_type || '').trim();
            
            if (attType) {
                if (attType === 'Other' && d.ca_final_attempts) {
                    metaParts.push(`${d.ca_final_attempts} attempt(s)`);
                } else {
                    metaParts.push('First Attempt');
                }
            }
            if (clearMonth && clearYear) metaParts.push(`Cleared: ${clearMonth} ${clearYear}`);
        }
        document.getElementById('edu-final-meta').textContent = metaParts.join(' · ');
        if (addFinalLink) addFinalLink.style.display = 'none';
    } else {
        finalDisplay.style.display = 'none';
        if (addFinalLink) addFinalLink.style.display = 'flex';
    }

    // CA Inter display
    const interCourse = (d.ca_inter_course || '').trim();
    const interDisplay = document.getElementById('edu-inter-display');
    const addInterLink = document.getElementById('addInterLink');
    if (interCourse) {
        interDisplay.style.display = 'block';
        document.getElementById('edu-inter-title').textContent = interCourse;
        let metaParts = [];
        const attType = (d.ca_inter_attempts_type || '').trim();
        if (attType) {
            if (attType === 'Other' && d.ca_inter_attempts) {
                metaParts.push(`${d.ca_inter_attempts} attempt(s)`);
            } else {
                metaParts.push('First Attempt');
            }
        }
        const clearMonth = (d.ca_inter_clear_month || '').trim();
        const clearYear = (d.ca_inter_clear_year || '').trim();
        if (clearMonth && clearYear) metaParts.push(`Cleared: ${clearMonth} ${clearYear}`);
        document.getElementById('edu-inter-meta').textContent = metaParts.join(' · ');
        if (addInterLink) addInterLink.style.display = 'none';
    } else {
        interDisplay.style.display = 'none';
        if (addInterLink) addInterLink.style.display = 'flex';
    }

    // CA Foundation display
    const foundCourse = (d.ca_found_course || '').trim();
    const foundDisplay = document.getElementById('edu-found-display');
    const addFoundLink = document.getElementById('addFoundLink');
    if (foundCourse) {
        foundDisplay.style.display = 'block';
        document.getElementById('edu-found-title').textContent = foundCourse;
        let metaParts = [];
        const attType = (d.ca_found_attempts_type || '').trim();
        if (attType) {
            if (attType === 'Other' && d.ca_found_attempts) {
                metaParts.push(`${d.ca_found_attempts} attempt(s)`);
            } else {
                metaParts.push('First Attempt');
            }
        }
        const clearMonth = (d.ca_found_clear_month || '').trim();
        const clearYear = (d.ca_found_clear_year || '').trim();
        if (clearMonth && clearYear) metaParts.push(`Cleared: ${clearMonth} ${clearYear}`);
        document.getElementById('edu-found-meta').textContent = metaParts.join(' · ');
        if (addFoundLink) addFoundLink.style.display = 'none';
    } else {
        foundDisplay.style.display = 'none';
        if (addFoundLink) addFoundLink.style.display = 'flex';
    }

    // Graduation display
    const gradDegree = (d.grad_degree || '').trim();
    const gradDisplay = document.getElementById('edu-grad-display');
    const addGradLink = document.getElementById('addGradLink');
    if (gradDegree) {
        gradDisplay.style.display = 'block';
        document.getElementById('edu-grad-title').textContent = gradDegree;
        let metaParts = [];
        if ((d.grad_university || '').trim()) metaParts.push(d.grad_university.trim());
        if ((d.grad_year || '').trim()) metaParts.push(d.grad_year);
        if ((d.grad_percentage || '').trim()) metaParts.push(d.grad_percentage.trim());
        document.getElementById('edu-grad-meta').textContent = metaParts.join(' · ');
        if (addGradLink) addGradLink.style.display = 'none';
    } else {
        gradDisplay.style.display = 'none';
        if (addGradLink) addGradLink.style.display = 'flex';
    }

    // Class XII display
    const c12Board = (d.class12_board || '').trim();
    const c12Display = document.getElementById('edu-12-display');
    const addClass12Link = document.getElementById('addClass12Link');
    if (c12Board) {
        c12Display.style.display = 'block';
        document.getElementById('edu-12-title').textContent = `Class XII — ${c12Board}`;
        let metaParts = [];
        if ((d.class12_school || '').trim()) metaParts.push(d.class12_school.trim());
        if ((d.class12_year || '').trim()) metaParts.push(d.class12_year);
        if ((d.class12_percentage || '').trim()) metaParts.push(d.class12_percentage.trim());
        document.getElementById('edu-12-meta').textContent = metaParts.join(' · ');
        if (addClass12Link) addClass12Link.style.display = 'none';
    } else {
        c12Display.style.display = 'none';
        if (addClass12Link) addClass12Link.style.display = 'flex';
    }

    // Class X display
    const c10Board = (d.class10_board || '').trim();
    const c10Display = document.getElementById('edu-10-display');
    const addClass10Link = document.getElementById('addClass10Link');
    if (c10Board) {
        c10Display.style.display = 'block';
        document.getElementById('edu-10-title').textContent = `Class X — ${c10Board}`;
        let metaParts = [];
        if ((d.class10_school || '').trim()) metaParts.push(d.class10_school.trim());
        if ((d.class10_year || '').trim()) metaParts.push(d.class10_year);
        if ((d.class10_percentage || '').trim()) metaParts.push(d.class10_percentage.trim());
        document.getElementById('edu-10-meta').textContent = metaParts.join(' · ');
        if (addClass10Link) addClass10Link.style.display = 'none';
    } else {
        c10Display.style.display = 'none';
        if (addClass10Link) addClass10Link.style.display = 'flex';
    }

    // Other education display
    const otherEduCourse = (d.other_edu_course || '').trim();
    const otherEduLevel = (d.other_edu_level || '').trim();
    const otherEduDisplay = document.getElementById('edu-other-display');
    const addOtherEduLink = document.getElementById('addOtherEduLink');
    if (otherEduCourse || otherEduLevel) {
        otherEduDisplay.style.display = 'block';
        document.getElementById('edu-other-title').textContent = otherEduCourse || otherEduLevel || 'Other Education';
        let metaParts = [];
        if (otherEduLevel && otherEduCourse) metaParts.push(otherEduLevel);
        if ((d.other_edu_institute || '').trim()) metaParts.push(d.other_edu_institute.trim());
        if ((d.other_edu_year || '').trim()) metaParts.push(d.other_edu_year);
        if ((d.other_edu_score || '').trim()) metaParts.push(d.other_edu_score.trim());
        document.getElementById('edu-other-meta').textContent = metaParts.join(' | ');
        if (addOtherEduLink) addOtherEduLink.style.display = 'none';
    } else {
        otherEduDisplay.style.display = 'none';
        if (addOtherEduLink) addOtherEduLink.style.display = 'flex';
    }

    // Update Education boost badge
    const eduBoost = document.getElementById('eduBoost');
    const hasEducation = !!(finalCourse || interCourse || foundCourse || gradDegree || c12Board || c10Board || otherEduCourse || otherEduLevel);
    if (hasEducation) {
        eduBoost.style.display = 'none';
    } else {
        eduBoost.style.display = 'inline-block';
    }

    const eduEditToggle = document.getElementById('eduEditToggle');
    if (eduEditToggle) {
        eduEditToggle.textContent = hasEducation ? 'Edit education' : 'Add education';
    }

    // --- EMPLOYMENT ---

    // Current Employment display
    const currentCompany = (d.emp_company_name || '').trim();
    const currentTitle = (d.emp_job_title || '').trim();
    const orgDisplay = document.getElementById('emp-org-display');
    const addOrgLink = document.getElementById('addOrgLink');
    if (currentCompany || currentTitle) {
        orgDisplay.style.display = 'block';
        document.getElementById('emp-org-title').textContent = currentTitle || currentCompany;
        let metaParts = [];
        if (currentTitle && currentCompany) {
            metaParts.push(currentCompany);
        }
        
        const expY = (d.emp_exp_years || '').trim();
        const expM = (d.emp_exp_months || '').trim();
        const expStr = [expY, expM].filter(Boolean).join(' ');
        if (expStr) metaParts.push(expStr);

        const type = (d.employment_type || '').trim();
        if (type) metaParts.push(type);

        document.getElementById('emp-org-meta').textContent = metaParts.join(' · ');

        const jobProfile = (d.emp_job_profile || '').trim();
        const empOrgDesc = document.getElementById('emp-org-desc');
        if (empOrgDesc) empOrgDesc.textContent = jobProfile;

        if (addOrgLink) addOrgLink.style.display = 'none';
        
        const empEditToggle = document.getElementById('empEditToggle');
        if (empEditToggle) empEditToggle.textContent = 'Edit employment';
    } else {
        orgDisplay.style.display = 'none';
        if (addOrgLink) addOrgLink.style.display = 'flex';
        
        const empEditToggle = document.getElementById('empEditToggle');
        if (empEditToggle) empEditToggle.textContent = 'Add employment';
    }

    // Articleship display
    const artFirm = (d.articleship_firm_name || '').trim();
    const artType = (d.articleship_firm_type || '').trim();
    const artDisplay = document.getElementById('emp-art-display');
    const addArtLink = document.getElementById('addArtLink');
    if (artFirm || (artType && artType !== 'None')) {
        artDisplay.style.display = 'block';
        document.getElementById('emp-art-title').textContent = artFirm || 'Articleship';
        let metaParts = [];
        if (artType && artType !== 'None') metaParts.push(artType);
        if ((d.articleship_domain || '').trim()) metaParts.push(d.articleship_domain);
        document.getElementById('emp-art-meta').textContent = metaParts.join(' · ');
        if (addArtLink) addArtLink.style.display = 'none';
    } else {
        artDisplay.style.display = 'none';
        if (addArtLink) addArtLink.style.display = 'flex';
    }

    // Industrial Training display
    const itCompany = (d.industrial_training_company || '').trim();
    const itDisplay = document.getElementById('emp-it-display');
    const addITLink = document.getElementById('addITLink');
    if (itCompany) {
        itDisplay.style.display = 'block';
        document.getElementById('emp-it-title').textContent = itCompany;
        document.getElementById('emp-it-meta').textContent = 'Industrial Training';
        if (addITLink) addITLink.style.display = 'none';
    } else {
        itDisplay.style.display = 'none';
        if (addITLink) addITLink.style.display = 'flex';
    }

    // Update Employment boost badge
    const empBoost = document.getElementById('empBoost');
    if (currentCompany || currentTitle || artFirm || (artType && artType !== 'None') || itCompany) {
        empBoost.style.display = 'none';
    } else {
        empBoost.style.display = 'inline-block';
    }

    // --- PROJECTS (MULTI-ENTRY) ---
    const projectDisplay = document.getElementById('project-display');
    const projectEditToggle = document.getElementById('projectEditToggle');
    if (projectDisplay) {
        projectDisplay.innerHTML = '';
        projectsList.forEach((proj, idx) => {
            const title = (proj.project_title || '').trim();
            if (!title) return;
            let metaParts = [];
            if ((proj.project_tag || '').trim()) metaParts.push(proj.project_tag.trim());
            if ((proj.project_client || '').trim()) metaParts.push(`Client: ${proj.project_client.trim()}`);
            if ((proj.project_status || '').trim()) metaParts.push(proj.project_status.trim());
            const workedFrom = [(proj.project_worked_from_month || '').trim(), (proj.project_worked_from_year || '').trim()].filter(Boolean).join(' ');
            if (workedFrom) metaParts.push(`Worked from: ${workedFrom}`);
            const meta = metaParts.join(' | ');
            const desc = (proj.project_details || '').trim();

            const entry = document.createElement('div');
            entry.className = 'p2-saved-entry';
            entry.innerHTML = `
                <div class="p2-saved-entry-header">
                    <div>
                        <div class="p2-saved-title">${title}</div>
                        <div class="p2-saved-meta">${meta}</div>
                        ${desc ? `<div class="p2-saved-meta" style="margin-top:0.35rem;">${desc}</div>` : ''}
                    </div>
                    <div class="p2-entry-actions">
                        <a href="javascript:void(0)" class="p2-entry-remove" title="Remove" data-project-remove="${idx}"><i class="fas fa-times"></i></a>
                        <a href="javascript:void(0)" class="p2-entry-edit" data-project-edit="${idx}"><i class="fas fa-pencil-alt"></i></a>
                    </div>
                </div>
            `;
            projectDisplay.appendChild(entry);
        });
    }
    if (projectEditToggle) {
        projectEditToggle.textContent = projectsList.length ? 'Add more' : 'Add project';
    }

    // --- CAREER PROFILE ---
    const setCareerValue = (id, value, fallback) => {
        const el = document.getElementById(id);
        if (!el) return;
        const safeVal = (value || '').toString().trim();
        el.textContent = safeVal || fallback;
        el.style.color = safeVal ? 'var(--p2-text)' : 'var(--p2-blue)';
    };
    const pMap = {
        'industrial': 'Industrial Training',
        'articleship': 'Articleship',
        'fresher_fresher': 'CA Fresher (Fresher)',
        'fresher_experienced': 'CA Fresher (Experienced)',
        'semi_fresher': 'Semi Qualified (Fresher)',
        'semi_experienced': 'Semi Qualified (Experienced)'
    };
    const portalDisplay = d.job_preference ? (pMap[d.job_preference] || d.job_preference) : '';
    setCareerValue('career-default-portal', portalDisplay, 'Add default portal');
    setCareerValue('career-current-industry', d.current_industry, 'Add current industry');
    setCareerValue('career-department', d.department, 'Add department');
    setCareerValue('career-role-category', d.role_category, 'Add role category');
    setCareerValue('career-job-role', d.job_role, 'Add job role');
    setCareerValue('career-desired-job-type', d.desired_job_type, 'Add desired job type');
    setCareerValue('career-desired-employment-type', d.desired_employment_type, 'Add desired employment type');
    setCareerValue('career-preferred-shift', d.preferred_shift, 'Add preferred shift');
    setCareerValue('career-preferred-location', d.preferred_locations, 'Add preferred location');
    setCareerValue('career-expected-salary', d.expected_salary, 'Add expected salary');
}

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    const user = await checkAuth();
    if (!user) return;

    document.getElementById('email').value = user.email;
    attachEntryRemoveButtons();

    // ----- Job Preference Logic -----
    const jobPrefSelect = document.getElementById('job_preference');
    const joiningGroup = document.getElementById('earliest_joining_date_group');
    const artCompGroup = document.getElementById('articleship_completion_date_group');
    const ctcGroup = document.getElementById('current_ctc_group');

    // CA Final Groups handling
    function handleJobPrefChange() {
        const v = jobPrefSelect.value;
        if (joiningGroup) joiningGroup.style.display = 'none';
        if (artCompGroup) artCompGroup.style.display = 'none';
        if (ctcGroup) ctcGroup.style.display = 'none';

        if (v === 'industrial') {
            if (artCompGroup) artCompGroup.style.display = 'block';
        } else if (['articleship', 'fresher_fresher', 'fresher_experienced', 'semi_fresher', 'semi_experienced'].includes(v)) {
            if (joiningGroup) joiningGroup.style.display = 'block';
        }
        if (['fresher_experienced', 'semi_experienced'].includes(v)) {
            if (ctcGroup) ctcGroup.style.display = 'block';
        }

        // Apply CA Final logic based on job preference
        const isAppearingStudent = ['articleship', 'industrial'].includes(v);
        document.querySelectorAll('.ca_final_cleared_fields').forEach(el => {
            if(el.classList.contains('attempts-count-group')) {
                 const typeDropdown = document.getElementById('ca_final_attempts_type');
                 if(!isAppearingStudent && typeDropdown && typeDropdown.value === 'Other') {
                     el.style.display = 'flex'; // Restore if 'Other'
                 } else {
                     el.style.display = 'none';
                 }
            } else {
                 el.style.display = isAppearingStudent ? 'none' : 'flex';
            }
        });
        document.querySelectorAll('.ca_final_appearance_fields').forEach(el => {
            el.style.display = isAppearingStudent ? 'flex' : 'none';
        });
    }
    if (jobPrefSelect) jobPrefSelect.addEventListener('change', handleJobPrefChange);

    // ----- Domain Other -----
    const domainSelect = document.getElementById('articleship_domain');
    const domainOtherGroup = document.getElementById('articleship_domain_other_group');
    if (domainSelect && domainOtherGroup) {
        domainSelect.addEventListener('change', () => {
            domainOtherGroup.style.display = domainSelect.value === 'Other' ? 'block' : 'none';
        });
    }

    // ----- Populate Years -----
    const currentYear = new Date().getFullYear();
    document.querySelectorAll('.populate-past-years').forEach(sel => {
        for(let y = currentYear; y >= 1990; y--) {
            const opt = document.createElement('option');
            opt.value = opt.textContent = y;
            sel.appendChild(opt);
        }
    });
    document.querySelectorAll('.populate-future-years').forEach(sel => {
        for(let y = currentYear; y <= currentYear + 10; y++) {
            const opt = document.createElement('option');
            opt.value = opt.textContent = y;
            sel.appendChild(opt);
        }
    });

    // ----- Attempts Dropdown Logic -----
    document.querySelectorAll('.attempts-dropdown').forEach(sel => {
        sel.addEventListener('change', (e) => {
            const targetId = e.target.getAttribute('data-target');
            const targetEl = document.getElementById(targetId);
            if(targetEl) {
                targetEl.style.display = e.target.value === 'Other' ? 'flex' : 'none';
            }
        });
    });

    // ----- Populate Employment Form Field Options -----
    const exp_years = document.getElementById('emp_exp_years');
    if (exp_years) {
        for(let i=0; i<=30; i++) {
            let opt = document.createElement('option');
            opt.value = i + (i===1 ? ' Year' : ' Years');
            opt.textContent = i + (i===1 ? ' Year' : ' Years');
            exp_years.appendChild(opt);
        }
    }
    const exp_months = document.getElementById('emp_exp_months');
    if (exp_months) {
        for(let i=0; i<=11; i++) {
            let opt = document.createElement('option');
            opt.value = i + (i===1 ? ' Month' : ' Months');
            opt.textContent = i + (i===1 ? ' Month' : ' Months');
            exp_months.appendChild(opt);
        }
    }

    // Employment Chips Selection
    const empChips = document.querySelectorAll('#emp_type_chips .p2-chip');
    empChips.forEach(chip => {
        chip.addEventListener('click', function(e) {
            e.preventDefault();
            empChips.forEach(c => c.classList.remove('selected'));
            this.classList.add('selected');
            const radio = this.querySelector('input[type="radio"]');
            if(radio) radio.checked = true;
        });
    });

    // Skills Tags Logic
    const skillsInput = document.getElementById('skills_input');
    const skillsContainer = document.getElementById('skills_container');
    const skillsHidden = document.getElementById('emp_skills_hidden');
    let skillsList = [];

    function renderSkills() {
        if (!skillsContainer) return;
        // clear old tags
        document.querySelectorAll('.p2-skill-tag').forEach(tag => tag.remove());
        
        skillsList.forEach((skill, index) => {
            const tag = document.createElement('span');
            tag.className = 'p2-skill-tag';
            tag.innerHTML = `${skill} <i class="fas fa-times" data-index="${index}"></i>`;
            skillsContainer.insertBefore(tag, skillsInput);
        });

        if (skillsHidden) skillsHidden.value = skillsList.join(', ');

        // Remove listener
        document.querySelectorAll('.p2-skill-tag i').forEach(closeBtn => {
            closeBtn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.getAttribute('data-index'));
                skillsList.splice(idx, 1);
                renderSkills();
            });
        });
    }

    // Allow external code (e.g. populateForm after AI extraction) to trigger skill rebuild
    if (skillsHidden) {
        skillsHidden.addEventListener('rebuildSkills', () => {
            const val = (skillsHidden.value || '').trim();
            skillsList = val ? val.split(',').map(s => s.trim()).filter(Boolean) : [];
            renderSkills();
        });
    }

    if (skillsInput) {
        skillsInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                const val = this.value.trim().replace(/,$/, '');
                if (val && !skillsList.includes(val)) {
                    skillsList.push(val);
                    renderSkills();
                }
                this.value = '';
            } else if (e.key === 'Backspace' && this.value === '' && skillsList.length > 0) {
                skillsList.pop();
                renderSkills();
            }
        });
        
        skillsInput.addEventListener('blur', function() {
             const val = this.value.trim().replace(/,$/, '');
             if (val && !skillsList.includes(val)) {
                 skillsList.push(val);
                 renderSkills();
             }
             this.value = '';
        });

        if (skillsContainer) {
            skillsContainer.addEventListener('click', () => skillsInput.focus());
        }
    }

    // Personal Details: dynamic language editor
    const languagesHiddenInput = document.getElementById('languages_json');
    const langEditorRows = document.getElementById('lang-editor-rows');
    const addLanguageRowBtn = document.getElementById('addLanguageRowBtn');
    let personalLanguages = [];

    function parseLanguages(raw) {
        return (raw || '')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
            .map(item => {
                const parts = item.split('|').map(p => p.trim());
                return {
                    language: parts[0] || '',
                    proficiency: parts[1] || 'Beginner',
                    read: parts[2] === '1',
                    write: parts[3] === '1',
                    speak: parts[4] === '1'
                };
            })
            .filter(r => r.language);
    }

    function serializeLanguages(rows) {
        return rows
            .filter(r => (r.language || '').trim())
            .map(r => `${r.language.trim()}|${r.proficiency || 'Beginner'}|${r.read ? '1' : '0'}|${r.write ? '1' : '0'}|${r.speak ? '1' : '0'}`)
            .join(', ');
    }

    function renderLanguageRows() {
        if (!langEditorRows) return;
        if (!personalLanguages.length) {
            personalLanguages = [{ language: '', proficiency: 'Beginner', read: false, write: false, speak: false }];
        }

        langEditorRows.innerHTML = personalLanguages.map((r, idx) => `
            <div class="p2-lang-editor-row" data-index="${idx}">
                <input type="text" class="lang-name" value="${r.language || ''}" placeholder="e.g., English">
                <select class="lang-prof">
                    <option value="Beginner" ${r.proficiency === 'Beginner' ? 'selected' : ''}>Beginner</option>
                    <option value="Intermediate" ${r.proficiency === 'Intermediate' ? 'selected' : ''}>Intermediate</option>
                    <option value="Expert" ${r.proficiency === 'Expert' ? 'selected' : ''}>Expert</option>
                </select>
                <label class="lang-check-wrap"><input type="checkbox" class="lang-read" ${r.read ? 'checked' : ''}></label>
                <label class="lang-check-wrap"><input type="checkbox" class="lang-write" ${r.write ? 'checked' : ''}></label>
                <label class="lang-check-wrap"><input type="checkbox" class="lang-speak" ${r.speak ? 'checked' : ''}></label>
                <button type="button" class="lang-remove" data-remove-index="${idx}" aria-label="Remove language"><i class="fas fa-times"></i></button>
            </div>
        `).join('');

        if (languagesHiddenInput) {
            languagesHiddenInput.value = serializeLanguages(personalLanguages);
        }
    }

    function loadLanguageRowsFromHidden() {
        if (!languagesHiddenInput) return;
        const parsed = parseLanguages(languagesHiddenInput.value || '');
        personalLanguages = parsed.length ? parsed : [{ language: '', proficiency: 'Beginner', read: false, write: false, speak: false }];
        renderLanguageRows();
    }

    if (langEditorRows) {
        langEditorRows.addEventListener('input', (e) => {
            const row = e.target.closest('.p2-lang-editor-row');
            if (!row) return;
            const idx = Number(row.getAttribute('data-index'));
            if (!personalLanguages[idx]) return;
            personalLanguages[idx].language = row.querySelector('.lang-name')?.value || '';
            personalLanguages[idx].proficiency = row.querySelector('.lang-prof')?.value || 'Beginner';
            personalLanguages[idx].read = !!row.querySelector('.lang-read')?.checked;
            personalLanguages[idx].write = !!row.querySelector('.lang-write')?.checked;
            personalLanguages[idx].speak = !!row.querySelector('.lang-speak')?.checked;
            if (languagesHiddenInput) languagesHiddenInput.value = serializeLanguages(personalLanguages);
        });

        langEditorRows.addEventListener('change', (e) => {
            const row = e.target.closest('.p2-lang-editor-row');
            if (!row) return;
            const idx = Number(row.getAttribute('data-index'));
            if (!personalLanguages[idx]) return;
            personalLanguages[idx].language = row.querySelector('.lang-name')?.value || '';
            personalLanguages[idx].proficiency = row.querySelector('.lang-prof')?.value || 'Beginner';
            personalLanguages[idx].read = !!row.querySelector('.lang-read')?.checked;
            personalLanguages[idx].write = !!row.querySelector('.lang-write')?.checked;
            personalLanguages[idx].speak = !!row.querySelector('.lang-speak')?.checked;
            if (languagesHiddenInput) languagesHiddenInput.value = serializeLanguages(personalLanguages);
        });

        langEditorRows.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('.lang-remove[data-remove-index]');
            if (!removeBtn) return;
            const idx = Number(removeBtn.getAttribute('data-remove-index'));
            personalLanguages.splice(idx, 1);
            renderLanguageRows();
        });
    }

    if (addLanguageRowBtn) {
        addLanguageRowBtn.addEventListener('click', () => {
            personalLanguages.push({ language: '', proficiency: 'Beginner', read: false, write: false, speak: false });
            renderLanguageRows();
        });
    }

    // ----- Load profile -----
    loadProfile().then(d => {
        const projectDetailsInput = document.getElementById('project_details');
        const projectDetailsLeft = document.getElementById('project-details-left');
        if (projectDetailsInput && projectDetailsLeft) {
            const left = 1000 - (projectDetailsInput.value || '').length;
            projectDetailsLeft.textContent = `${Math.max(0, left)}`;
        }
        const summaryInput = document.getElementById('profile_summary');
        const summaryLeft = document.getElementById('summary-left');
        if (summaryInput && summaryLeft) {
            const left = 1000 - (summaryInput.value || '').length;
            summaryLeft.textContent = `${Math.max(0, left)}`;
        }
        loadLanguageRowsFromHidden();
    });

    // ----- File uploads -----
    ['resume', 'cover_letter'].forEach(type => {
        const config = fileConfig[type];
        if (!config) return;

        if (config.input) {
            config.input.addEventListener('change', (e) => handleFile(e.target.files[0], type));
        }

        if (config.dropZone) {
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => {
                config.dropZone.addEventListener(ev, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (['dragenter', 'dragover'].includes(ev)) config.dropZone.classList.add('hover');
                    else config.dropZone.classList.remove('hover');
                }, false);
            });
            config.dropZone.addEventListener('drop', (e) => handleFile(e.dataTransfer.files[0], type));
        }
    });

    // Remove file buttons
    document.body.addEventListener('click', (e) => {
        const btn = e.target.closest('.p2-remove-file');
        if (btn && btn.getAttribute('data-target')) {
            hideFileDisplay(btn.getAttribute('data-target'));
            refreshHeader();
        }
    });

    // Saved-entry remove (X) buttons (for old-style static entries)
    document.body.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.p2-entry-remove');
        if (!removeBtn) return;
        e.preventDefault();

        // Multi-entry: certification remove
        const certIdx = removeBtn.getAttribute('data-cert-remove');
        if (certIdx !== null && certIdx !== undefined && certIdx !== '') {
            removeCertEntry(parseInt(certIdx));
            return;
        }
        // Multi-entry: project remove
        const projIdx = removeBtn.getAttribute('data-project-remove');
        if (projIdx !== null && projIdx !== undefined && projIdx !== '') {
            removeProjectEntry(parseInt(projIdx));
            return;
        }
        // Old-style static entry remove
        clearEntryData(removeBtn.getAttribute('data-entry-id'));
    });

    // Multi-entry: certification edit (delegated)
    document.body.addEventListener('click', (e) => {
        const editBtn = e.target.closest('[data-cert-edit]');
        if (!editBtn) return;
        e.preventDefault();
        const idx = parseInt(editBtn.getAttribute('data-cert-edit'));
        if (idx >= 0 && idx < certificationsList.length) {
            certEditIndex = idx;
            loadCertIntoForm(certificationsList[idx]);
            toggleForm('sec-certification-form');
        }
    });

    // Multi-entry: project edit (delegated)
    document.body.addEventListener('click', (e) => {
        const editBtn = e.target.closest('[data-project-edit]');
        if (!editBtn) return;
        e.preventDefault();
        const idx = parseInt(editBtn.getAttribute('data-project-edit'));
        if (idx >= 0 && idx < projectsList.length) {
            projectEditIndex = idx;
            loadProjectIntoForm(projectsList[idx]);
            toggleForm('sec-project-form');
        }
    });


    // Project details character counter
    const projectDetailsInput = document.getElementById('project_details');
    const projectDetailsLeft = document.getElementById('project-details-left');
    function updateProjectCharCount() {
        if (!projectDetailsInput || !projectDetailsLeft) return;
        const left = 1000 - (projectDetailsInput.value || '').length;
        projectDetailsLeft.textContent = `${Math.max(0, left)}`;
    }
    if (projectDetailsInput) {
        projectDetailsInput.addEventListener('input', updateProjectCharCount);
        updateProjectCharCount();
    }

    // Profile summary character counter + sync headline field
    const profileSummaryInput = document.getElementById('profile_summary');
    const summaryLeft = document.getElementById('summary-left');
    const headlineHidden = document.getElementById('headline');
    function updateSummaryCharCount() {
        if (!profileSummaryInput || !summaryLeft) return;
        const left = 1000 - (profileSummaryInput.value || '').length;
        summaryLeft.textContent = `${Math.max(0, left)}`;
        if (headlineHidden) headlineHidden.value = (profileSummaryInput.value || '').trim();
    }
    if (profileSummaryInput) {
        profileSummaryInput.addEventListener('input', updateSummaryCharCount);
        updateSummaryCharCount();
    }

    // ----- Collapsible card sections -----
    // Helper: toggle a form section (now acting as Modals)
    function toggleForm(targetId) {
        const target = document.getElementById(targetId);
        if (!target) return;
        
        // Close all other forms to ensure only one modal is active
        document.querySelectorAll('.p2-card-form:not(.collapsed)').forEach(f => {
            if (f.id !== targetId) f.classList.add('collapsed');
        });

        target.classList.toggle('collapsed');
        
        const backdrop = document.getElementById('p2_global_backdrop');
        if (!target.classList.contains('collapsed')) {
            document.body.classList.add('p2-modal-open');
            if (backdrop) backdrop.style.display = 'block';
        } else {
            document.body.classList.remove('p2-modal-open');
            if (backdrop) backdrop.style.display = 'none';
        }
    }

    function ensureModalControls() {
        document.querySelectorAll('.p2-card-form').forEach(form => {
            if (!form.id) return;

            // Top-right close button (X)
            if (!form.querySelector('.p2-modal-close')) {
                const closeBtn = document.createElement('button');
                closeBtn.type = 'button';
                closeBtn.className = 'p2-modal-close';
                closeBtn.setAttribute('data-close', form.id);
                closeBtn.setAttribute('aria-label', 'Close');
                closeBtn.innerHTML = '<i class="fas fa-times"></i>';
                form.appendChild(closeBtn);
            }

            // Ensure inline actions with Cancel + Save
            let actions = form.querySelector('.p2-inline-actions');
            if (!actions) {
                actions = document.createElement('div');
                actions.className = 'p2-inline-actions';
                form.appendChild(actions);
            }

            if (!actions.querySelector('.p2-inline-cancel[data-close]')) {
                const cancelBtn = document.createElement('button');
                cancelBtn.type = 'button';
                cancelBtn.className = 'p2-inline-cancel';
                cancelBtn.setAttribute('data-close', form.id);
                cancelBtn.textContent = 'Cancel';
                actions.appendChild(cancelBtn);
            }

            if (!actions.querySelector('.p2-inline-save[data-save]') && !actions.querySelector('.p2-btn-save')) {
                const saveBtn = document.createElement('button');
                saveBtn.type = 'button';
                saveBtn.className = 'p2-inline-save';
                saveBtn.setAttribute('data-save', form.id);
                saveBtn.textContent = 'Save';
                actions.appendChild(saveBtn);
            } else if (actions.querySelector('.p2-btn-save') && !actions.querySelector('.p2-btn-save[data-save]')) {
                const existingSave = actions.querySelector('.p2-btn-save');
                existingSave.setAttribute('data-save', form.id);
            }
        });
    }

    ensureModalControls();

    // Header card-actions (top-right "Add education" / "Add employment" etc.)
    document.querySelectorAll('.p2-card-action[data-toggle]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            toggleForm(link.getAttribute('data-toggle'));
        });
    });

    // Multi-entry: certEditToggle + addCertLink open form with cleared state
    const certEditToggleBtn = document.getElementById('certEditToggle');
    if (certEditToggleBtn) {
        certEditToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            clearCertForm();
            toggleForm('sec-certification-form');
        });
    }
    const addCertLinkBtn = document.getElementById('addCertLink');
    if (addCertLinkBtn) {
        addCertLinkBtn.addEventListener('click', (e) => {
            e.preventDefault();
            clearCertForm();
            toggleForm('sec-certification-form');
        });
    }

    // Multi-entry: projectEditToggle + addProjectLink open form with cleared state
    const projectEditToggleBtn = document.getElementById('projectEditToggle');
    if (projectEditToggleBtn) {
        projectEditToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            clearProjectForm();
            toggleForm('sec-project-form');
        });
    }
    const addProjectLinkBtn = document.getElementById('addProjectLink');
    if (addProjectLinkBtn) {
        addProjectLinkBtn.addEventListener('click', (e) => {
            e.preventDefault();
            clearProjectForm();
            toggleForm('sec-project-form');
        });
    }

    // Header profile edit pen
    document.querySelectorAll('.p2-edit-pen[data-toggle]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            toggleForm(link.getAttribute('data-toggle'));
        });
    });

    // Add-links ("+ Add CA qualification", "+ Add graduation", etc.)
    document.querySelectorAll('.p2-add-link[data-toggle]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            toggleForm(link.getAttribute('data-toggle'));
        });
    });

    // Entry edit pencils
    document.querySelectorAll('.p2-entry-edit[data-toggle]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('data-toggle');
            const target = document.getElementById(targetId);
            if (target && target.classList.contains('collapsed')) {
                toggleForm(targetId);
            }
        });
    });

    // Cancel buttons
    document.querySelectorAll('.p2-inline-cancel[data-close]').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-close');
            if (targetId === 'sec-certification-form') clearCertForm();
            if (targetId === 'sec-project-form') clearProjectForm();
            const target = document.getElementById(targetId);
            if (target && !target.classList.contains('collapsed')) {
                toggleForm(targetId); // Re-use toggle logic to handle backdrop correctly
            }
            // Refresh displays after closing
            refreshHeader();
        });
    });

    // Modal top-right X close
    document.body.addEventListener('click', (e) => {
        const closeBtn = e.target.closest('.p2-modal-close[data-close]');
        if (!closeBtn) return;
        const targetId = closeBtn.getAttribute('data-close');
        if (targetId === 'sec-certification-form') clearCertForm();
        if (targetId === 'sec-project-form') clearProjectForm();
        const target = document.getElementById(targetId);
        if (target && !target.classList.contains('collapsed')) {
            toggleForm(targetId);
        }
        refreshHeader();
    });

    // Modal Save buttons (section-level save, closes popup only)
    document.body.addEventListener('click', (e) => {
        const saveActionBtn = e.target.closest('.p2-inline-save[data-save], .p2-btn-save[data-save]');
        if (!saveActionBtn) return;
        const targetId = saveActionBtn.getAttribute('data-save');

        // Multi-entry: save cert or project entry before closing
        if (targetId === 'sec-certification-form') {
            saveCertEntry();
        } else if (targetId === 'sec-project-form') {
            saveProjectEntry();
        }

        const target = document.getElementById(targetId);
        if (target && !target.classList.contains('collapsed')) {
            toggleForm(targetId);
        }
        refreshHeader();

        // Auto-save to Supabase (silent — no alert popup)
        saveProfileToCloud({ silent: true });
    });

    // Close modal when clicking the global backdrop
    const backdrop = document.getElementById('p2_global_backdrop');
    if (backdrop) {
        backdrop.addEventListener('click', () => {
            document.querySelectorAll('.p2-card-form:not(.collapsed)').forEach(f => {
                f.classList.add('collapsed');
            });
            document.body.classList.remove('p2-modal-open');
            backdrop.style.display = 'none';
            refreshHeader();
        });
    }

    // ----- Save -----
    profileForm.addEventListener('submit', handleSave);

    // ----- Menu (shared) -----
    const menuButton = document.getElementById('menuButton');
    const expandedMenu = document.getElementById('expandedMenu');
    const menuCloseBtn = document.getElementById('menuCloseBtn');
    const authButtonsContainer = document.querySelector('.auth-buttons-container');

    if (user) {
        let displayName = user.email;
        try {
            const pd = JSON.parse(localStorage.getItem('userProfileData') || '{}');
            if (pd.name && pd.name.trim()) displayName = pd.name.trim();
        } catch (e) { }
        const initial = displayName.charAt(0).toUpperCase();
        authButtonsContainer.innerHTML = `<div class="user-profile-container"><div class="user-icon-wrapper"><div class="user-icon" data-email="${user.email}">${initial}</div><div class="user-hover-card"><div class="user-hover-content"><p class="user-email">${displayName}</p><a href="/profile.html" class="profile-link-btn">Edit Profile</a><button id="logoutBtn" class="logout-btn">Logout</button></div></div></div></div>`;

        const userIconWrapper = authButtonsContainer.querySelector('.user-icon-wrapper');
        const userHoverCard = authButtonsContainer.querySelector('.user-hover-card');
        if (userIconWrapper && userHoverCard) {
            userIconWrapper.addEventListener('click', (event) => {
                event.stopPropagation();
                userHoverCard.classList.toggle('show');
            });
        }

        document.getElementById('logoutBtn').addEventListener('click', async () => {
            await supabaseClient.auth.signOut();
            localStorage.clear();
            window.location.href = '/login.html';
        });
    }

    menuButton.addEventListener('click', () => expandedMenu.classList.add('active'));
    menuCloseBtn.addEventListener('click', () => expandedMenu.classList.remove('active'));
});

