
"use strict";

/* =====================================
   NoteNest — Personal Notes Workspace
   Notes, Search, Categories, Checklist,
   Favorites, Pin, Archive, Trash, Backup
===================================== */

const NOTE_KEY = "notenest_notes_v2";
const SETTINGS_KEY = "notenest_settings_v2";

const DEFAULT_SETTINGS = {
    theme: "light",
    displayName: "",
    language: "en",
    sort: "updated",
    layout: "grid"
};

let notes = readStorage(NOTE_KEY, []);
if (!Array.isArray(notes)) notes = [];

let settings = {
    ...DEFAULT_SETTINGS,
    ...readStorage(SETTINGS_KEY, {})
};

let currentView = "all";
let currentCategory = "";
let editingId = null;
let toastTimer;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const byId = id => document.getElementById(id);

function readStorage(key, fallback) {
    try {
        const value = localStorage.getItem(key);
        return value === null ? fallback : JSON.parse(value);
    } catch (error) {
        console.error("Storage read error:", error);
        return fallback;
    }
}

function saveStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (error) {
        console.error("Storage save error:", error);
        toast("Could not save. Check browser storage.");
        return false;
    }
}

function saveNotes() {
    return saveStorage(NOTE_KEY, notes);
}

function saveSettings() {
    return saveStorage(SETTINGS_KEY, settings);
}

function makeId() {
    return Date.now().toString(36) +
        Math.random().toString(36).slice(2, 9);
}

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function toast(message) {
    const element = byId("toast");
    if (!element) {
        console.log(message);
        return;
    }

    element.textContent = message;
    element.classList.add("show");

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        element.classList.remove("show");
    }, 2500);
}

function openModal(modal) {
    if (!modal) return;
    modal.hidden = false;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
}

function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove("open");
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
}

function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Recently";

    return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric"
    });
}

function getNote(noteId) {
    return notes.find(note => note.id === noteId);
}

/* ---------- Notes and navigation ---------- */

function getVisibleNotes() {
    const search = (byId("searchInput")?.value || "")
        .trim().toLowerCase();

    let result = notes.filter(note => {
        if (currentView === "trash") return Boolean(note.trashed);
        if (note.trashed) return false;

        if (currentView === "archive") return Boolean(note.archived);
        if (note.archived) return false;

        if (currentView === "favorites" && !note.favorite) return false;
        if (currentView === "pinned" && !note.pinned) return false;

        if (
            currentView === "checklists" &&
            !note.isChecklist
        ) return false;

        if (
            currentView === "category" &&
            note.category !== currentCategory
        ) return false;

        if (currentView === "all") return true;
        return true;
    });

    if (search) {
        result = result.filter(note => {
            const searchable = [
                note.title,
                note.content,
                note.category,
                ...(note.tags || []),
                ...(note.checklistItems || []).map(item => item.text)
            ].join(" ").toLowerCase();

            return searchable.includes(search);
        });
    }

    const sort = byId("sortSelect")?.value || settings.sort;

    result.sort((a, b) => {
        if (currentView !== "trash" && Boolean(a.pinned) !== Boolean(b.pinned)) {
            return Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
        }

        if (sort === "title") {
            return (a.title || "").localeCompare(b.title || "");
        }

        if (sort === "created") {
            return new Date(b.createdAt || 0) -
                new Date(a.createdAt || 0);
        }

        return new Date(b.updatedAt || 0) -
            new Date(a.updatedAt || 0);
    });

    return result;
}

function renderNotes() {
    const grid = byId("notesGrid");
    if (!grid) {
        console.error("Notes grid not found. Check index.html.");
        return;
    }

    const visible = getVisibleNotes();

    grid.classList.toggle("list-layout", settings.layout === "list");

    grid.innerHTML = visible.map(note => {
        const checklistItems = (note.checklistItems || []).map(
            (item, index) => `
                <label class="checklist-item">
                    <input type="checkbox"
                        data-action="check-item"
                        data-id="${escapeHTML(note.id)}"
                        data-index="${index}"
                        ${item.done ? "checked" : ""}>
                    <span class="${item.done ? "completed" : ""}">
                        ${escapeHTML(item.text)}
                    </span>
                </label>
            `
        ).join("");

        const tags = (note.tags || []).map(tag => `
            <span class="note-tag">${escapeHTML(tag)}</span>
        `).join("");

        const title = escapeHTML(note.title || "Untitled note");
        const content = escapeHTML(note.content || "");
        const color = escapeHTML(note.color || "lavender");

        return `
            <article class="note-card color-${color}"
                data-note-id="${escapeHTML(note.id)}">

                <div class="note-card-top">
                    <span class="note-category">
                        ${escapeHTML(note.category || "Personal")}
                    </span>

                    <div class="note-quick-actions">
                        <button type="button" data-action="pin"
                            data-id="${escapeHTML(note.id)}"
                            title="${note.pinned ? "Unpin" : "Pin"} note"
                            aria-label="Toggle pin">
                            ${note.pinned ? "📌" : "📍"}
                        </button>

                        <button type="button" data-action="favorite"
                            data-id="${escapeHTML(note.id)}"
                            title="${note.favorite ? "Remove favorite" : "Add favorite"}"
                            aria-label="Toggle favorite">
                            ${note.favorite ? "♥" : "♡"}
                        </button>
                    </div>
                </div>

                <button type="button" class="note-main"
                    data-action="edit"
                    data-id="${escapeHTML(note.id)}">
                    <h3>${title}</h3>
                    <p class="note-content">${content}</p>
                </button>

                ${checklistItems
                    ? `<div class="note-checklist">${checklistItems}</div>`
                    : ""}

                ${tags ? `<div class="note-tags">${tags}</div>` : ""}

                <div class="note-card-footer">
                    <span class="note-date">
                        ${formatDate(note.updatedAt)}
                    </span>

                    <div class="note-footer-actions">
                        ${note.trashed ? `
                            <button type="button" data-action="restore"
                                data-id="${escapeHTML(note.id)}"
                                title="Restore note">↩</button>

                            <button type="button" data-action="delete-forever"
                                data-id="${escapeHTML(note.id)}"
                                title="Delete permanently">×</button>
                        ` : `
                            <button type="button" data-action="archive"
                                data-id="${escapeHTML(note.id)}"
                                title="${note.archived ? "Unarchive" : "Archive"}">
                                ${note.archived ? "↗" : "▱"}
                            </button>

                            <button type="button" data-action="delete"
                                data-id="${escapeHTML(note.id)}"
                                title="Move to trash">🗑</button>
                        `}
                    </div>
                </div>
            </article>
        `;
    }).join("");

    const empty = byId("emptyState");
    if (empty) empty.hidden = visible.length !== 0;

    grid.hidden = visible.length === 0;

    updateStats();
    updateNavigation();
}

function updateStats() {
    const active = notes.filter(note => !note.trashed && !note.archived);

    const total = notes.filter(note => !note.trashed).length;
    const favorites = active.filter(note => note.favorite).length;
    const checklists = active.filter(note => note.isChecklist).length;

    // IDs from the supplied index.html
    if (byId("allCount")) byId("allCount").textContent = total;
    if (byId("statTotal")) byId("statTotal").textContent = total;
    if (byId("statFavorites")) byId("statFavorites").textContent = favorites;
    if (byId("statChecklists")) byId("statChecklists").textContent = checklists;

    if (byId("notesFooterCount")) {
        byId("notesFooterCount").textContent =
            `${active.length} ${active.length === 1 ? "note" : "notes"}`;
    }
}

function updateNavigation() {
    $$("[data-view]").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.view === currentView
        );
    });

    $$("[data-category]").forEach(button => {
        button.classList.toggle(
            "active",
            currentView === "category" &&
            button.dataset.category === currentCategory
        );
    });

    const titles = {
        all: "All Notes",
        favorites: "Favorites",
        pinned: "Pinned Notes",
        checklists: "Checklists",
        archive: "Archive",
        trash: "Trash",
        category: currentCategory
    };

    const title = titles[currentView] || "All Notes";

    if (byId("currentPage")) byId("currentPage").textContent = title;
    if (byId("sectionTitle")) {
        byId("sectionTitle").textContent =
            currentView === "all" ? "All your notes" : title;
    }

    if (byId("pageTitle")) {
        byId("pageTitle").textContent =
            currentView === "all"
                ? "Your thoughts, beautifully organized."
                : title;
    }

    if (byId("notesSubtitle")) {
        byId("notesSubtitle").textContent =
            `${getVisibleNotes().length} notes in this view`;
    }

    $$("[data-filter]").forEach(button => {
        const activeFilter = currentView === "category"
            ? currentCategory
            : "All";

        button.classList.toggle(
            "active",
            button.dataset.filter === activeFilter
        );
    });

    if (byId("emptyTitle")) {
        byId("emptyTitle").textContent =
            currentView === "trash"
                ? "Your trash is empty."
                : "A fresh page awaits.";
    }

    if (byId("emptyDescription")) {
        byId("emptyDescription").textContent =
            currentView === "trash"
                ? "Deleted notes will appear here."
                : "Your next great idea could start right here.";
    }
}

function setView(view, category = "") {
    currentView = view;
    currentCategory = category;

    byId("sidebar")?.classList.remove("open");
    renderNotes();
}

/* ---------- Create and edit notes ---------- */

function resetEditor() {
    editingId = null;

    if (byId("noteId")) byId("noteId").value = "";
    if (byId("noteTitle")) byId("noteTitle").value = "";
    if (byId("noteContent")) byId("noteContent").value = "";
    if (byId("noteTags")) byId("noteTags").value = "";
    if (byId("noteCategory")) byId("noteCategory").value = "Personal";
    if (byId("noteColor")) byId("noteColor").value = "lavender";
    if (byId("noteIsChecklist")) byId("noteIsChecklist").checked = false;
    if (byId("noteIsPinned")) byId("noteIsPinned").checked = false;
    if (byId("checklistItems")) byId("checklistItems").value = "";

    if (byId("checklistEditor")) {
        byId("checklistEditor").hidden = true;
    }

    if (byId("editorHeading")) {
        byId("editorHeading").textContent = "✦ YOUR NEW THOUGHT";
    }

    if (byId("editorStatus")) {
        byId("editorStatus").textContent =
            "Your changes will be saved locally.";
    }
}

function openEditor(noteId = null) {
    resetEditor();

    if (noteId) {
        const note = getNote(noteId);
        if (!note || note.trashed) return;

        editingId = note.id;

        byId("noteId").value = note.id;
        byId("noteTitle").value = note.title || "";
        byId("noteContent").value = note.content || "";
        byId("noteCategory").value = note.category || "Personal";
        byId("noteColor").value = note.color || "lavender";
        byId("noteTags").value = (note.tags || []).join(", ");
        byId("noteIsPinned").checked = Boolean(note.pinned);
        byId("noteIsChecklist").checked = Boolean(note.isChecklist);

        if (byId("checklistItems")) {
            byId("checklistItems").value =
                (note.checklistItems || []).map(item => item.text).join("\n");
        }

        if (byId("checklistEditor")) {
            byId("checklistEditor").hidden = !note.isChecklist;
        }

        if (byId("editorHeading")) {
            byId("editorHeading").textContent = "✦ EDIT YOUR THOUGHT";
        }

        if (byId("editorStatus")) {
            byId("editorStatus").textContent = "Update your note below.";
        }
    }

    openModal(byId("noteModal"));
    setTimeout(() => byId("noteTitle")?.focus(), 50);
}

function closeEditor() {
    closeModal(byId("noteModal"));
}

function saveCurrentNote(event) {
    event?.preventDefault();

    const title = byId("noteTitle")?.value.trim() || "";
    const content = byId("noteContent")?.value.trim() || "";
    const category = byId("noteCategory")?.value || "Personal";
    const color = byId("noteColor")?.value || "lavender";
    const tags = (byId("noteTags")?.value || "")
        .split(",").map(tag => tag.trim()).filter(Boolean);

    const pinned = Boolean(byId("noteIsPinned")?.checked);
    const isChecklist = Boolean(byId("noteIsChecklist")?.checked);

    const checklistItems = isChecklist
        ? (byId("checklistItems")?.value || "")
            .split("\n")
            .map(text => text.trim())
            .filter(Boolean)
            .map(text => ({ text, done: false }))
        : [];

    if (!title && !content && checklistItems.length === 0) {
        toast("Please write something before saving.");
        byId("noteTitle")?.focus();
        return;
    }

    const now = new Date().toISOString();
    const existing = editingId ? getNote(editingId) : null;

    const oldChecklist = existing?.checklistItems || [];

    const note = {
        id: editingId || makeId(),
        title: title || "Untitled note",
        content,
        category,
        color,
        tags,
        pinned,
        favorite: existing?.favorite || false,
        archived: existing?.archived || false,
        trashed: existing?.trashed || false,
        isChecklist,
        checklistItems: checklistItems.map(item => {
            const oldItem = oldChecklist.find(old => old.text === item.text);
            return {
                text: item.text,
                done: oldItem ? oldItem.done : false
            };
        }),
        createdAt: existing?.createdAt || now,
        updatedAt: now
    };

    const previousNotes = [...notes];

    if (existing) {
        notes = notes.map(item => item.id === editingId ? note : item);
    } else {
        notes.unshift(note);
    }

    if (!saveNotes()) {
        notes = previousNotes;
        return;
    }

    closeEditor();
    renderNotes();
    toast(existing ? "Note updated successfully!" : "Note saved successfully!");
}

/* ---------- Note actions ---------- */

function updateNote(noteId, changes) {
    const previousNotes = [...notes];

    notes = notes.map(note =>
        note.id === noteId
            ? { ...note, ...changes, updatedAt: new Date().toISOString() }
            : note
    );

    if (saveNotes()) {
        renderNotes();
    } else {
        notes = previousNotes;
    }
}

function toggleFavorite(noteId) {
    const note = getNote(noteId);
    if (!note) return;

    updateNote(noteId, { favorite: !note.favorite });
    toast(note.favorite ? "Removed from favorites." : "Added to favorites.");
}

function togglePin(noteId) {
    const note = getNote(noteId);
    if (!note) return;

    updateNote(noteId, { pinned: !note.pinned });
    toast(note.pinned ? "Note unpinned." : "Note pinned.");
}

function toggleArchive(noteId) {
    const note = getNote(noteId);
    if (!note) return;

    updateNote(noteId, { archived: !note.archived });
    toast(note.archived ? "Note unarchived." : "Note archived.");
}

function moveToTrash(noteId) {
    const note = getNote(noteId);
    if (!note) return;

    updateNote(noteId, { trashed: true });
    toast("Note moved to trash.");
}

function restoreNote(noteId) {
    updateNote(noteId, { trashed: false, archived: false });
    toast("Note restored.");
}

function deleteForever(noteId) {
    if (!confirm("Permanently delete this note? This cannot be undone.")) return;

    const previousNotes = [...notes];
    notes = notes.filter(note => note.id !== noteId);

    if (saveNotes()) {
        renderNotes();
        toast("Note permanently deleted.");
    } else {
        notes = previousNotes;
    }
}

function toggleChecklistItem(noteId, index, checked) {
    const note = getNote(noteId);
    if (!note) return;

    const checklistItems = (note.checklistItems || []).map((item, i) =>
        i === index ? { ...item, done: checked } : item
    );

    updateNote(noteId, { checklistItems });
}

/* ---------- Theme and settings ---------- */

function applyTheme() {
    document.body.classList.toggle("dark-mode", settings.theme === "dark");

    const button = byId("themeToggle");
    if (button) {
        button.textContent = settings.theme === "dark" ? "☀" : "☾";
        button.title = settings.theme === "dark"
            ? "Switch to light mode"
            : "Switch to dark mode";
    }
}

function toggleTheme() {
    settings.theme = settings.theme === "dark" ? "light" : "dark";

    if (saveSettings()) {
        applyTheme();
        toast(settings.theme === "dark" ? "Dark mode enabled." : "Light mode enabled.");
    }
}

function updateProfileName() {
    const name = settings.displayName.trim();
    const avatar = byId("profileBtn");

    if (avatar) {
        avatar.textContent = name ? name.charAt(0).toUpperCase() : "N";
        avatar.title = name || "Profile settings";
    }

    const label = byId("todayLabel");
    if (label) {
        label.textContent = name
            ? `WELCOME BACK, ${name.toUpperCase()}`
            : "YOUR PERSONAL SPACE";
    }
}

function openSettings() {
    if (byId("displayName")) {
        byId("displayName").value = settings.displayName || "";
    }

    if (byId("languageSelect")) {
        byId("languageSelect").value = settings.language || "en";
    }

    openModal(byId("settingsModal"));
}

function closeSettings() {
    closeModal(byId("settingsModal"));
}

function saveSettingsFromForm(event) {
    event?.preventDefault();

    settings.displayName = byId("displayName")?.value.trim() || "";
    settings.language = byId("languageSelect")?.value || "en";

    if (saveSettings()) {
        updateProfileName();
        closeSettings();
        toast("Settings saved successfully.");
    }
}

/* ---------- Backup and trash ---------- */

function exportBackup() {
    const backup = {
        app: "NoteNest",
        version: 2,
        exportedAt: new Date().toISOString(),
        notes,
        settings
    };

    const blob = new Blob(
        [JSON.stringify(backup, null, 2)],
        { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "notenest-backup.json";
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Backup exported successfully.");
}

function importBackup(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
        try {
            const data = JSON.parse(reader.result);

            if (!Array.isArray(data.notes)) {
                throw new Error("Invalid backup file");
            }

            const validNotes = data.notes.filter(note =>
                note && typeof note.id === "string"
            );

            if (!confirm("Import backup? Your current notes will be replaced.")) {
                event.target.value = "";
                return;
            }

            const previousNotes = notes;
            const previousSettings = settings;

            notes = validNotes.map(note => ({
                favorite: false,
                pinned: false,
                archived: false,
                trashed: false,
                tags: [],
                checklistItems: [],
                isChecklist: false,
                ...note
            }));

            settings = {
                ...DEFAULT_SETTINGS,
                ...(data.settings || {})
            };

            if (!saveNotes() || !saveSettings()) {
                notes = previousNotes;
                settings = previousSettings;
                toast("Import failed. Your previous session was restored.");
                return;
            }

            applyTheme();
            updateProfileName();
            renderNotes();
            toast("Backup imported successfully.");
        } catch (error) {
            console.error(error);
            toast("Invalid backup file. Please select a NoteNest JSON backup.");
        }

        event.target.value = "";
    };

    reader.readAsText(file);
}

function emptyTrash() {
    if (!notes.some(note => note.trashed)) {
        toast("Trash is already empty.");
        return;
    }

    if (!confirm("Permanently delete all trashed notes?")) return;

    const previousNotes = [...notes];
    notes = notes.filter(note => !note.trashed);

    if (saveNotes()) {
        renderNotes();
        toast("Trash emptied successfully.");
    } else {
        notes = previousNotes;
    }
}

/* ---------- Event handling ---------- */

document.addEventListener("click", event => {
    const actionButton = event.target.closest("[data-action]");

    if (actionButton) {
        const { action, id: noteId } = actionButton.dataset;

        switch (action) {
            case "edit":
                openEditor(noteId);
                break;
            case "pin":
                togglePin(noteId);
                break;
            case "favorite":
                toggleFavorite(noteId);
                break;
            case "archive":
                toggleArchive(noteId);
                break;
            case "delete":
                moveToTrash(noteId);
                break;
            case "restore":
                restoreNote(noteId);
                break;
            case "delete-forever":
                deleteForever(noteId);
                break;
        }
        return;
    }

    const category = event.target.closest("[data-category]");
    if (category) {
        setView("category", category.dataset.category);
        return;
    }

    const view = event.target.closest("[data-view]");
    if (view) {
        setView(view.dataset.view);
        return;
    }

    const filter = event.target.closest("[data-filter]");
    if (filter) {
        if (filter.dataset.filter === "All") {
            setView("all");
        } else {
            setView("category", filter.dataset.filter);
        }
        return;
    }

    const closeButton = event.target.closest("[data-close-modal]");
    if (closeButton) {
        closeEditor();
        closeSettings();
    }
});

document.addEventListener("change", event => {
    const target = event.target;

    if (target.matches('[data-action="check-item"]')) {
        toggleChecklistItem(
            target.dataset.id,
            Number(target.dataset.index),
            target.checked
        );
        return;
    }

    if (target.id === "noteIsChecklist") {
        if (byId("checklistEditor")) {
            byId("checklistEditor").hidden = !target.checked;
        }
        return;
    }

    if (target.id === "sortSelect") {
        settings.sort = target.value;
        saveSettings();
        renderNotes();
    }
});

document.addEventListener("input", event => {
    if (event.target.id === "searchInput") {
        renderNotes();
    }
});

/* ---------- Buttons ---------- */

function bindButton(id, callback) {
    const button = byId(id);
    if (button) {
        button.addEventListener("click", event => {
            event.preventDefault();
            callback(event);
        });
    }
}

function initialize() {
    // Create notes
    bindButton("createNoteBtn", () => openEditor());
    bindButton("emptyCreateBtn", () => openEditor());

    // Editor
    bindButton("closeEditorBtn", closeEditor);

    byId("noteForm")?.addEventListener("submit", saveCurrentNote);

    // Theme
    bindButton("themeToggle", toggleTheme);

    // Settings
    bindButton("settingsBtn", openSettings);
    bindButton("profileBtn", openSettings);
    bindButton("closeSettingsBtn", closeSettings);
    byId("settingsModal")?.addEventListener("click", event => {
        if (event.target === byId("settingsModal")) closeSettings();
    });
    byId("noteModal")?.addEventListener("click", event => {
        if (event.target === byId("noteModal")) closeEditor();
    });

    // Settings form has no form wrapper in the supplied HTML
    bindButton("saveSettingsBtn", saveSettingsFromForm);

    bindButton("exportNotesBtn", exportBackup);
    bindButton("importNotesBtn", () => byId("importFileInput")?.click());
    bindButton("clearTrashBtn", emptyTrash);

    byId("importFileInput")?.addEventListener("change", importBackup);

    // Sort and layout
    const sortSelect = byId("sortSelect");
    if (sortSelect) {
        sortSelect.value = settings.sort || "updated";
    }

    bindButton("viewToggle", () => {
        settings.layout = settings.layout === "grid" ? "list" : "grid";
        saveSettings();
        renderNotes();
        toast(settings.layout === "list" ? "List view enabled." : "Grid view enabled.");
    });

    // Mobile sidebar
    bindButton("mobileMenuBtn", () => {
        byId("sidebar")?.classList.toggle("open");
    });

    // Keyboard shortcuts
    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            closeEditor();
            closeSettings();
        }

        const tag = document.activeElement?.tagName;
        const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(tag);

        if (!typing && event.key.toLowerCase() === "n") {
            event.preventDefault();
            openEditor();
        }

        if (!typing && event.key === "/") {
            event.preventDefault();
            byId("searchInput")?.focus();
        }
    });

    applyTheme();
    updateProfileName();
    renderNotes();

    console.log("NoteNest initialized successfully.");
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
} else {
    initialize();
}
