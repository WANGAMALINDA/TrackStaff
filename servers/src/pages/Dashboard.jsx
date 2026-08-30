import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../components/supabaseClient";
import Footer from "../components/footer";
import {
  ClipboardList,
  Search,
  X,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Check,
  Loader2,
  Ban,
  Plus,
  ImageOff,
  Inbox,
  User,
  Users,
  CalendarClock,
  CalendarPlus,
  Pencil,
  XCircle,
  Flame,
  ArrowBigUp,
  UploadCloud
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Assignable staff: fetched from `profiles` where role = 'staff'.    */
/* Reports store the assignee's profile UUID in `assigned_to` (text), */
/* matching how Dashboard/Profile look up "assigned to me" work.      */
/* The staff picker displays names but the value saved is the id.     */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Design tokens                                                       */
/* ------------------------------------------------------------------ */
const COLORS = {
  green900: "#064E3B",
  green700: "#15803D",
  green600: "#16A34A",
  green500: "#22B95E",
  green100: "#DCFCE7",
  green50: "#F0FDF4",
  amber500: "#F59E0B",
  amber100: "#FEF3C7",
  orange500: "#F97316",
  orange100: "#FFE9D6",
  blue100: "#DBEAFE",
  purple100: "#F3E8FF",
  red500: "#EF4444",
  red100: "#FEE2E2",
  ink900: "#111827",
  ink700: "#374151",
  ink500: "#6B7280",
  ink300: "#D1D5DB",
  ink200: "#E5E7EB",
  ink100: "#F3F4F6",
  ink50: "#F9FAFB",
};

const ACTIVE_STATUSES = ["in_progress", "under_review"];
const OPEN_STATUS = "open";

const PRIORITY_LABEL = { Low: "Low", Medium: "Medium", High: "High" };
const PRIORITY_PILL = {
  Low: { bg: COLORS.green100, fg: COLORS.green700 },
  Medium: { bg: COLORS.amber100, fg: "#92400E" },
  High: { bg: COLORS.orange100, fg: "#9A3412" },
};

function deriveTitle(title, categoryName) {
  return title || categoryName || "Untitled report";
}

// `r.assigned_to` stores the assigned staff member's profile UUID (matches
// what Dashboard/Profile query against). The human-readable name is resolved
// separately via a staffNameById lookup, since the id alone isn't friendly to display.
function assigneeInfo(r) {
  if (r.assigned_to) {
    return { type: "assigned", id: r.assigned_to };
  }
  return { type: null, id: null };
}

function resolveAssigneeName(assignee, staffNameById) {
  if (!assignee?.id) return null;
  return staffNameById[assignee.id] || assignee.id;
}

function firstReportPhoto(images) {
  if (!images || images.length === 0) return null;
  return [...images].sort((a, b) => new Date(a.uploaded_at) - new Date(b.uploaded_at))[0]
    .image_url;
}

function PhotoThumb({ src, size = 44, radius = 10, style }) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        style={{ width: size, height: size, borderRadius: radius, objectFit: "cover", border: `1px solid ${COLORS.ink200}`, flexShrink: 0, ...style }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: COLORS.ink100,
        color: COLORS.ink300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        border: `1px solid ${COLORS.ink200}`,
        ...style,
      }}
    >
      <ImageOff size={size * 0.42} />
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return "No date";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    ", " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  );
}

const EVENT_STATUS_PILL = {
  scheduled: { bg: COLORS.blue100, fg: "#1D4ED8", label: "Scheduled" },
  completed: { bg: COLORS.green100, fg: COLORS.green700, label: "Completed" },
  cancelled: { bg: COLORS.ink100, fg: COLORS.ink500, label: "Cancelled" },
};

function nextEvent(events) {
  if (!events || events.length === 0) return null;
  const scheduled = events.filter((e) => e.status === "scheduled");
  const pool = scheduled.length ? scheduled : events;
  return [...pool].sort((a, b) => new Date(a.start_date) - new Date(b.start_date))[0];
}

const STAGE_OPTIONS = [
  { key: "under_review", label: "Under Review", dbStatus: "under_review" },
  { key: "in_progress", label: "In Progress", dbStatus: "in_progress" },
  { key: "completed", label: "Completed", dbStatus: "resolved" },
];

function currentStageKey(status) {
  if (status === "under_review") return "under_review";
  if (status === "in_progress") return "in_progress";
  return "completed";
}

function isStale(a) {
  if (a.status === "resolved" || a.status === "closed" || a.status === "rejected") return false;
  const created = new Date(a.created_at);
  const days = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
  return days >= 7;
}

function Pill({ bg, fg, children }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0, background: bg, color: fg }}>
      {children}
    </span>
  );
}

function Tag({ children }) {
  return (
    <span style={{ background: COLORS.ink100, color: COLORS.ink700, fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 7 }}>
      {children}
    </span>
  );
}

function Btn({ variant = "ghost", children, style, ...rest }) {
  const variants = {
    ghost: { background: "#fff", border: `1px solid ${COLORS.ink200}`, color: COLORS.ink700 },
    primary: { background: COLORS.green600, border: "1px solid transparent", color: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.05)" },
    danger: { background: COLORS.red500, border: "1px solid transparent", color: "#fff" },
  };
  return (
    <button
      {...rest}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        borderRadius: 10,
        fontSize: 13,
        fontWeight: 600,
        padding: "10px 17px",
        cursor: rest.disabled ? "not-allowed" : "pointer",
        whiteSpace: "nowrap",
        transition: ".15s ease",
        opacity: rest.disabled ? 0.5 : 1,
        ...variants[variant],
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function IconBtn({ children, ...rest }) {
  return (
    <button {...rest} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${COLORS.ink200}`, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: rest.disabled ? "not-allowed" : "pointer", color: COLORS.ink500, flexShrink: 0 }}>
      {children}
    </button>
  );
}

function StatusStepper({ status, busy, onChange, compact }) {
  const current = currentStageKey(status);
  return (
    <div style={{ display: "flex", gap: 4, background: COLORS.ink100, padding: 4, borderRadius: 10 }}>
      {STAGE_OPTIONS.map((opt) => {
        const active = opt.key === current;
        return (
          <button
            key={opt.key}
            onClick={(e) => { e.stopPropagation(); onChange(opt.key); }}
            disabled={busy}
            style={{
              flex: 1,
              padding: compact ? "5px 6px" : "7px 10px",
              borderRadius: 7,
              border: "none",
              fontSize: compact ? 10.5 : 12,
              fontWeight: 700,
              cursor: busy ? "not-allowed" : "pointer",
              background: active ? COLORS.green600 : "transparent",
              color: active ? "#fff" : COLORS.ink500,
              whiteSpace: "nowrap",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function AssignmentCard({ a, removing, busy, onView, onStageChange, onReject, staffNameById }) {
  const stale = isStale(a);
  const priorityStyle = PRIORITY_PILL[a.severity] || PRIORITY_PILL.Low;
  const assigneeName = resolveAssigneeName(a.assignee, staffNameById);

  return (
    <div
      style={{
        background: "#fff",
        border: a.isTopVoted ? `1px solid ${COLORS.red500}` : `1px solid ${COLORS.ink200}`,
        borderRadius: 13,
        boxShadow: "0 1px 2px rgba(17,24,39,0.04), 0 8px 24px -12px rgba(17,24,39,0.10)",
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 9,
        transition: "transform .18s ease, box-shadow .18s ease, opacity .26s ease",
        opacity: removing ? 0 : 1,
        transform: removing ? "translateX(40px) scale(.96)" : "none",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, minWidth: 0 }}>
          <PhotoThumb src={a.photoUrl} />
          <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, color: COLORS.ink900, alignSelf: "center" }}>
            {a.title}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <Pill bg={priorityStyle.bg} fg={priorityStyle.fg}>
            {a.isTopVoted && <Flame size={11} />}
            {PRIORITY_LABEL[a.severity] || "Low"} priority
          </Pill>
          <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 700, color: COLORS.ink700 }}>
            <ArrowBigUp size={14} color={a.votes > 0 ? COLORS.red500 : COLORS.ink500} fill={a.votes > 0 ? COLORS.red500 : "none"} />
            <span>{a.votes ?? 0} votes</span>
          </div>
        </div>
      </div>

      <div style={{ fontSize: 11, color: COLORS.ink500, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", minHeight: 17 }}>
        {a.description || "No description provided."}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px", fontSize: 10.5, color: COLORS.ink700 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, color: stale ? COLORS.red500 : COLORS.ink700, fontWeight: stale ? 700 : 400 }}>
          {stale ? "Stale · " : "Opened "}
          {formatDate(a.created_at)}
        </div>
      </div>

      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {a.categoryName && <Tag>{a.categoryName}</Tag>}
        {a.location && <Tag>{a.location}</Tag>}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10.5, color: COLORS.ink700 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <User size={11} color={COLORS.ink500} />
          {assigneeName || <span style={{ color: COLORS.ink300 }}>Unassigned</span>}
        </div>
        {a.nextEvent && (
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <CalendarClock size={11} color={COLORS.ink500} />
            {formatDateTime(a.nextEvent.start_date)}
            {a.nextEvent.status !== "scheduled" && (
              <span style={{ color: COLORS.ink500 }}>· {EVENT_STATUS_PILL[a.nextEvent.status]?.label}</span>
            )}
          </div>
        )}
      </div>

      <StatusStepper status={a.status} busy={busy} onChange={(stage) => onStageChange(a.id, stage)} compact />

      <div style={{ display: "flex", gap: 6, borderTop: `1px solid ${COLORS.ink100}`, paddingTop: 9 }}>
        <button onClick={() => onView(a.id)} style={actionBtnStyle()}>
          <Eye size={12} /> View
        </button>
        <button onClick={() => onReject(a.id)} disabled={busy} style={actionBtnStyle(COLORS.red500)}>
          <Ban size={12} /> Reject
        </button>
      </div>
    </div>
  );
}

function actionBtnStyle(color) {
  return {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    background: "#fff",
    border: `1px solid ${COLORS.ink200}`,
    borderRadius: 8,
    padding: "6px 5px",
    fontSize: 10.5,
    fontWeight: 600,
    color: color || COLORS.ink700,
    cursor: "pointer",
  };
}

function ViewModal({ assignment, onClose, onStageChange, onReject, busy, onSaveAssignedTo, savingAssignedTo, onOpenSchedule, onEventStatusChange, eventBusyId, staffOptions, staffNameById }) {
  const [editingAssignee, setEditingAssignee] = useState(false);
  const [draftId, setDraftId] = useState("");

  useEffect(() => {
    setEditingAssignee(false);
  }, [assignment?.id]);

  if (!assignment) return null;
  const a = assignment;
  const priorityStyle = PRIORITY_PILL[a.severity] || PRIORITY_PILL.Low;
  const events = [...(a.events || [])].sort((x, y) => new Date(x.start_date) - new Date(y.start_date));
  const assigneeName = resolveAssigneeName(a.assignee, staffNameById);

  function startEditingAssignee() {
    setDraftId(a.assignee.id || "");
    setEditingAssignee(true);
  }

  function saveAssignee() {
    if (!draftId) return;
    onSaveAssignedTo(a.id, draftId);
    setEditingAssignee(false);
  }

  function clearAssignee() {
    onSaveAssignedTo(a.id, null);
    setEditingAssignee(false);
  }

  return (
    <Overlay onClose={onClose}>
      <div style={modalStyle()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 12, minWidth: 0 }}>
            <PhotoThumb src={a.photoUrl} size={56} radius={12} />
            <div>
              <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 800 }}>{a.title}</h2>
              <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                <Pill bg={priorityStyle.bg} fg={priorityStyle.fg}>
                  {a.isTopVoted && <Flame size={11} />}
                  {PRIORITY_LABEL[a.severity] || "Low"} priority
                </Pill>
                <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 700, color: COLORS.ink700 }}>
                  <ArrowBigUp size={14} color={a.votes > 0 ? COLORS.red500 : COLORS.ink500} fill={a.votes > 0 ? COLORS.red500 : "none"} />
                  <span>{a.votes ?? 0} votes</span>
                </div>
              </div>
            </div>
          </div>
          <IconBtn onClick={onClose}><X size={15} /></IconBtn>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={rowLabelStyle()}>Status</div>
          <StatusStepper status={a.status} busy={busy} onChange={(stage) => onStageChange(a.id, stage)} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={rowLabelStyle()}>Assigned to</div>
          {editingAssignee ? (
            <div style={{ display: "flex", gap: 6 }}>
              <select
                value={draftId}
                onChange={(e) => setDraftId(e.target.value)}
                style={{ flex: 1, border: `1px solid ${COLORS.ink200}`, borderRadius: 8, padding: "7px 10px", fontSize: 13.5, fontFamily: "inherit", background: "#fff" }}
              >
                <option value="">Select staff member…</option>
                {staffOptions.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.full_name}
                  </option>
                ))}
              </select>
              <IconBtn onClick={saveAssignee} disabled={savingAssignedTo || !draftId}>
                {savingAssignedTo ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Check size={13} />}
              </IconBtn>
              <IconBtn onClick={() => setEditingAssignee(false)} disabled={savingAssignedTo}>
                <X size={13} />
              </IconBtn>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: COLORS.ink900 }}>
              <User size={14} color={COLORS.ink500} />
              {assigneeName || <span style={{ color: COLORS.ink500 }}>Unassigned</span>}
              <button onClick={startEditingAssignee} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.ink500, padding: 2, display: "flex" }}>
                <Pencil size={12} />
              </button>
              {assigneeName && (
                <button onClick={clearAssignee} disabled={savingAssignedTo} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.red500, padding: 2, display: "flex", fontSize: 11.5, fontWeight: 600 }}>
                  Unassign
                </button>
              )}
            </div>
          )}
        </div>

        <ModalRow k="Description" v={a.description || "No description provided."} />
        <ModalRow k="Location" v={a.location || "Not specified"} />
        <ModalRow k="Category" v={a.categoryName || "—"} />
        <ModalRow k="Opened" v={formatDate(a.created_at)} />
        {a.additional_information && <ModalRow k="Additional Information" v={a.additional_information} />}

        <div style={{ marginBottom: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={rowLabelStyle()}>Scheduled Visits</div>
            <button
              onClick={() => onOpenSchedule(a)}
              style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: COLORS.green700, fontSize: 12, fontWeight: 700 }}
            >
              <CalendarPlus size={13} /> Schedule
            </button>
          </div>
          {events.length === 0 ? (
            <div style={{ fontSize: 12.5, color: COLORS.ink500 }}>No visits scheduled yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {events.map((ev) => {
                const st = EVENT_STATUS_PILL[ev.status] || EVENT_STATUS_PILL.scheduled;
                const busyEv = eventBusyId === ev.id;
                return (
                  <div key={ev.id} style={{ border: `1px solid ${COLORS.ink100}`, borderRadius: 10, padding: "9px 11px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.ink900 }}>{ev.event_name || "Site visit"}</div>
                        <div style={{ fontSize: 11.5, color: COLORS.ink500, marginTop: 2 }}>{formatDateTime(ev.start_date)}{ev.end_date ? ` – ${formatDateTime(ev.end_date)}` : ""}</div>
                        {ev.location && <div style={{ fontSize: 11.5, color: COLORS.ink500 }}>{ev.location}</div>}
                      </div>
                      <Pill bg={st.bg} fg={st.fg}>{st.label}</Pill>
                    </div>
                    {ev.status === "scheduled" && (
                      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                        <button
                          onClick={() => onEventStatusChange(ev.id, "completed")}
                          disabled={busyEv}
                          style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: COLORS.green700, background: "none", border: `1px solid ${COLORS.ink200}`, borderRadius: 7, padding: "4px 8px", cursor: "pointer" }}
                        >
                          <CheckCircle2 size={11} /> Mark done
                        </button>
                        <button
                          onClick={() => onEventStatusChange(ev.id, "cancelled")}
                          disabled={busyEv}
                          style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: COLORS.red500, background: "none", border: `1px solid ${COLORS.ink200}`, borderRadius: 7, padding: "4px 8px", cursor: "pointer" }}
                        >
                          <XCircle size={11} /> Cancel
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
          <button
            onClick={() => onReject(a.id)}
            disabled={busy}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: busy ? "not-allowed" : "pointer", color: COLORS.red500, fontSize: 12.5, fontWeight: 700, padding: "6px 4px" }}
          >
            <Ban size={13} /> Reject this report
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function ModalRow({ k, v }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={rowLabelStyle()}>{k}</div>
      <div style={{ fontSize: 13.5, color: COLORS.ink900, lineHeight: 1.5 }}>{v}</div>
    </div>
  );
}

function rowLabelStyle() {
  return { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: COLORS.ink500, marginBottom: 4 };
}

function RejectModal({ assignment, onCancel, onConfirm }) {
  if (!assignment) return null;
  return (
    <Overlay onClose={onCancel}>
      <div style={{ ...modalStyle(), maxWidth: 380, textAlign: "center" }}>
        <div style={{ width: 52, height: 52, borderRadius: "50%", background: COLORS.red100, color: COLORS.red500, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
          <AlertTriangle size={24} />
        </div>
        <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 800 }}>Reject this report?</h2>
        <p style={{ color: COLORS.ink500, fontSize: 13, margin: "8px 0 0" }}>
          <b>"{assignment.title}"</b> will be marked rejected and removed from active assignments.
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <Btn variant="ghost" style={{ flex: 1, justifyContent: "center" }} onClick={onCancel}>Cancel</Btn>
          <Btn variant="danger" style={{ flex: 1, justifyContent: "center" }} onClick={onConfirm}>Reject</Btn>
        </div>
      </div>
    </Overlay>
  );
}

function CompleteModal({ assignment, onCancel, onConfirm, completing }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [comment, setComment] = useState("");

  function handleFileChange(e) {
    const selected = e.target.files && e.target.files[0];
    if (selected) {
      setFile(selected);
      setPreview(URL.createObjectURL(selected));
    }
  }

  if (!assignment) return null;

  return (
    <Overlay onClose={completing ? undefined : onCancel}>
      <div style={{ ...modalStyle(), maxWidth: 420, textAlign: "center" }}>
        <div style={{ width: 52, height: 52, borderRadius: "50%", background: COLORS.green100, color: COLORS.green600, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
          <CheckCircle2 size={24} />
        </div>
        <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 800 }}>Complete Assignment</h2>
        <p style={{ color: COLORS.ink500, fontSize: 13, margin: "8px 0 16px" }}>
          Upload a proof image and leave a comment to mark <b>"{assignment.title}"</b> as completed.
        </p>

        <div style={{ marginBottom: 16, textAlign: "left" }}>
          <div style={rowLabelStyle()}>Proof Image (Device Upload)</div>
          <div
            style={{
              position: "relative",
              border: `2px dashed ${COLORS.ink200}`,
              borderRadius: 10,
              padding: preview ? 8 : 20,
              textAlign: "center",
              background: COLORS.ink50,
              transition: "all 0.2s ease",
            }}
          >
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              disabled={completing}
              style={{
                position: "absolute",
                inset: 0,
                opacity: 0,
                cursor: completing ? "not-allowed" : "pointer",
                width: "100%",
                height: "100%",
                zIndex: 10,
              }}
            />
            {preview ? (
              <img
                src={preview}
                alt="Proof preview"
                style={{ width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 8, display: "block" }}
              />
            ) : (
              <div style={{ color: COLORS.ink500, fontSize: 13, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <UploadCloud size={26} color={COLORS.ink400} />
                <span style={{ fontWeight: 600, color: COLORS.ink700 }}>Click or drag image here</span>
                <span style={{ fontSize: 11 }}>JPEG, PNG up to 5MB</span>
              </div>
            )}
          </div>
        </div>

        <div style={{ marginBottom: 20, textAlign: "left" }}>
          <div style={rowLabelStyle()}>Resolution Comment / Notes</div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Describe the fix or leave details about the issue..."
            rows={3}
            disabled={completing}
            style={{ ...fieldStyle(), resize: "vertical" }}
          />
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <Btn variant="ghost" style={{ flex: 1, justifyContent: "center" }} onClick={onCancel} disabled={completing}>
            Cancel
          </Btn>
          <Btn variant="primary" style={{ flex: 1, justifyContent: "center" }} onClick={() => onConfirm(file, comment)} disabled={completing || !file}>
            {completing ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> : <CheckCircle2 size={15} />}
            Submit Proof
          </Btn>
        </div>
      </div>
    </Overlay>
  );
}

function ScheduleEventModal({ report, saving, error, onCancel, onSubmit }) {
  const [eventName, setEventName] = useState("Site visit");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (report) {
      setEventName("Site visit");
      setStart("");
      setEnd("");
      setLocation(report.location || "");
      setNotes("");
    }
  }, [report?.id]);

  if (!report) return null;

  const canSubmit = eventName.trim() && start;

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit({
      event_name: eventName.trim(),
      start_date: new Date(start).toISOString(),
      end_date: end ? new Date(end).toISOString() : null,
      location: location.trim() || null,
      notes: notes.trim() || null,
    });
  }

  return (
    <Overlay onClose={onCancel}>
      <div style={{ ...modalStyle(), maxWidth: 420 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 800 }}>Schedule Visit</h2>
            <p style={{ margin: 0, fontSize: 12.5, color: COLORS.ink500 }}>{report.title}</p>
          </div>
          <IconBtn onClick={onCancel}><X size={15} /></IconBtn>
        </div>

        {error && (
          <div style={{ background: COLORS.red100, color: "#991B1B", borderRadius: 10, padding: "9px 13px", fontSize: 12.5, marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <div style={rowLabelStyle()}>Event name</div>
          <input
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            style={fieldStyle()}
          />
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={rowLabelStyle()}>Starts</div>
            <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} style={fieldStyle()} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={rowLabelStyle()}>Ends (optional)</div>
            <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} style={fieldStyle()} />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={rowLabelStyle()}>Location</div>
          <input value={location} onChange={(e) => setLocation(e.target.value)} style={fieldStyle()} />
        </div>

        <div style={{ marginBottom: 4 }}>
          <div style={rowLabelStyle()}>Notes (optional)</div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            style={{ ...fieldStyle(), resize: "vertical", fontFamily: "inherit" }}
          />
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <Btn variant="ghost" style={{ flex: 1, justifyContent: "center" }} onClick={onCancel}>Cancel</Btn>
          <Btn variant="primary" style={{ flex: 1, justifyContent: "center" }} disabled={!canSubmit || saving} onClick={handleSubmit}>
            {saving ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> : <CalendarPlus size={15} />} Schedule
          </Btn>
        </div>
      </div>
    </Overlay>
  );
}

function fieldStyle() {
  return { width: "100%", border: `1px solid ${COLORS.ink200}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" };
}

function NewAssignmentRow({ report, onAssign, assigning, staffOptions }) {
  const [assigneeId, setAssigneeId] = useState(""); 
  const priorityStyle = PRIORITY_PILL[report.severity] || PRIORITY_PILL.Low;
  const canAssign = !!assigneeId;

  return (
    <div style={{ padding: "13px 4px", borderBottom: `1px solid ${COLORS.ink100}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <PhotoThumb src={report.photoUrl} />
        <div style={{ flex: "1 1 160px", minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: COLORS.ink900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {report.title}
          </div>
          <div style={{ fontSize: 11.5, color: COLORS.ink500, marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span>{report.categoryName}</span>
            {report.location && <span>· {report.location}</span>}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
          <Pill bg={priorityStyle.bg} fg={priorityStyle.fg}>
            {report.isTopVoted && <Flame size={11} />}
            {report.severity || "Low"}
          </Pill>
          <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 700, color: COLORS.ink700 }}>
            <ArrowBigUp size={12} color={report.votes > 0 ? COLORS.red500 : COLORS.ink500} fill={report.votes > 0 ? COLORS.red500 : "none"} />
            <span>{report.votes ?? 0} votes</span>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <select
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
          disabled={assigning}
          style={{ flex: 1, border: `1px solid ${COLORS.ink200}`, borderRadius: 8, padding: "7px 10px", fontSize: 13.5, fontFamily: "inherit", boxSizing: "border-box", background: "#fff" }}
        >
          <option value="">Select staff member…</option>
          {staffOptions.map((staff) => (
            <option key={staff.id} value={staff.id}>
              {staff.full_name}
            </option>
          ))}
        </select>
        <Btn
          variant="primary"
          style={{ padding: "8px 14px", flexShrink: 0 }}
          disabled={assigning || !canAssign}
          onClick={() => onAssign(report, assigneeId)}
        >
          {assigning ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Plus size={13} />}
          Assign
        </Btn>
      </div>
    </div>
  );
}

function NewAssignmentModal({ open, loading, error, reports, search, onSearch, onAssign, assigningId, onClose, staffOptions }) {
  if (!open) return null;
  return (
    <Overlay onClose={onClose}>
      <div style={{ ...modalStyle(), maxWidth: 560 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 800 }}>New Assignment</h2>
            <p style={{ margin: 0, fontSize: 12.5, color: COLORS.ink500 }}>
              Pick an open report, choose a person or group to own it, then assign.
            </p>
          </div>
          <IconBtn onClick={onClose}><X size={15} /></IconBtn>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 9, background: COLORS.ink50 || "#F9FAFB", border: `1px solid ${COLORS.ink200}`, borderRadius: 11, padding: "9px 13px", marginBottom: 12 }}>
          <Search size={14} color={COLORS.ink500} />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search open reports…"
            style={{ border: "none", outline: "none", fontSize: 13, fontFamily: "inherit", width: "100%", background: "transparent", color: COLORS.ink900 }}
          />
        </div>

        {error && (
          <div style={{ background: COLORS.red100, color: "#991B1B", borderRadius: 10, padding: "9px 13px", fontSize: 12.5, marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div style={{ maxHeight: 420, overflowY: "auto" }}>
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "40px 0", color: COLORS.ink500 }}>
              <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
            </div>
          ) : reports.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "40px 10px", color: COLORS.ink500 }}>
              <Inbox size={26} color={COLORS.ink300} style={{ marginBottom: 10 }} />
              <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink900, marginBottom: 4 }}>No open reports</div>
              <div style={{ fontSize: 12 }}>Every open report has already been assigned.</div>
            </div>
          ) : (
            reports.map((r) => (
              <NewAssignmentRow
                key={r.id}
                report={r}
                assigning={assigningId === r.id}
                onAssign={onAssign}
                staffOptions={staffOptions}
              />
            ))
          )}
        </div>
      </div>
    </Overlay>
  );
}

function Overlay({ onClose, children }) {
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,.5)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100 }}
    >
      {children}
    </div>
  );
}

function modalStyle() {
  return { background: "#fff", borderRadius: 18, maxWidth: 460, width: "100%", boxShadow: "0 20px 50px -15px rgba(17,24,39,.25)", padding: 26, maxHeight: "88vh", overflowY: "auto" };
}

function Toast({ message }) {
  if (!message) return null;
  return (
    <div style={{ position: "fixed", bottom: 26, left: "50%", transform: "translateX(-50%)", background: COLORS.ink900, color: "#fff", padding: "11px 18px", borderRadius: 11, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 9, zIndex: 120, boxShadow: "0 10px 30px rgba(0,0,0,.25)" }}>
      <Check size={16} color={COLORS.green500} />
      <span>{message}</span>
    </div>
  );
}

function EmptyState({ title, text }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "70px 20px", color: COLORS.ink500 }}>
      <div style={{ width: 64, height: 64, borderRadius: 18, background: COLORS.ink100, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18, color: COLORS.ink300 }}>
        <ClipboardList size={30} />
      </div>
      <h3 style={{ margin: "0 0 6px", fontSize: 16, color: COLORS.ink900, fontWeight: 700 }}>{title}</h3>
      <p style={{ margin: 0, fontSize: 13, maxWidth: 280 }}>{text}</p>
    </div>
  );
}

export default function AssignmentsPage() {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const [filter, setFilter] = useState("all"); 
  const [search, setSearch] = useState("");
  const [viewId, setViewId] = useState(null);
  const [rejectId, setRejectId] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const [toast, setToast] = useState("");

  const [savingAssignedTo, setSavingAssignedTo] = useState(false);

  const [completeTarget, setCompleteTarget] = useState(null);
  const [completing, setCompleting] = useState(false);

  const [scheduleTarget, setScheduleTarget] = useState(null);
  const [scheduling, setScheduling] = useState(false);
  const [scheduleError, setScheduleError] = useState(null);
  const [eventBusyId, setEventBusyId] = useState(null);

  // Staff who can be assigned reports — only profiles with role = 'staff'.
  const [staffOptions, setStaffOptions] = useState([]);

  useEffect(() => {
    let isMounted = true;
    async function loadStaff() {
      const { data, error: staffErr } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("role", "staff")
        .order("full_name", { ascending: true });
      if (!staffErr && isMounted) {
        setStaffOptions((data || []).filter((s) => s.full_name));
      }
    }
    loadStaff();
    return () => {
      isMounted = false;
    };
  }, []);

  // Lookup from staff profile id -> display name, used to render assignees
  // (`reports.assigned_to` stores the id so it matches Dashboard/Profile queries).
  const staffNameById = useMemo(
    () => Object.fromEntries(staffOptions.map((s) => [s.id, s.full_name])),
    [staffOptions]
  );

  const fetchAssignments = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: fetchErr } = await supabase
      .from("reports")
      .select(`
        id, title, description, location, status, severity, votes,
        additional_information, created_at, updated_at,
        category_id, assigned_to, assigned_at, assigned_to_group_id,
        categories ( id, category_name ),
        report_images ( image_url, uploaded_at ),
        events ( id, event_name, description, location, event_date, start_date, end_date, status, notes, created_at )
      `)
      .in("status", ACTIVE_STATUSES)
      .order("votes", { ascending: false })
      .order("created_at", { ascending: false });

    if (fetchErr) {
      setError(fetchErr.message);
      setLoading(false);
      return;
    }

    let leaderId = null;
    let maxVotes = 0;
    (data || []).forEach((r) => {
      const v = r.votes || 0;
      if (v > maxVotes) {
        maxVotes = v;
        leaderId = r.id;
      }
    });

    const normalized = (data || []).map((r) => {
      const categoryName = r.categories?.category_name || "Uncategorized";
      const votes = r.votes || 0;
      const isTopVoted = r.id === leaderId && votes > 0;

      return {
        ...r,
        votes,
        categoryName,
        title: deriveTitle(r.title, categoryName),
        photoUrl: firstReportPhoto(r.report_images),
        assignee: assigneeInfo(r),
        events: r.events || [],
        nextEvent: nextEvent(r.events),
        isTopVoted,
        severity: isTopVoted ? "High" : r.severity || "Low",
      };
    });

    setAssignments(normalized);
    setLoading(false);
  }, []);

  async function saveAssignedTo(reportId, value) {
    setSavingAssignedTo(true);

    const { error: updateErr } = await supabase
      .from("reports")
      .update({
        assigned_to: value || null,
        assigned_to_group_id: null,
        assigned_at: value ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      })
      .eq("id", reportId);

    setSavingAssignedTo(false);

    if (updateErr) {
      setError(updateErr.message);
      return;
    }
    setToast(value ? "Assignment updated" : "Assignment removed");
    fetchAssignments();
  }

  function openSchedule(assignment) {
    setScheduleError(null);
    setScheduleTarget(assignment);
  }

  async function submitSchedule(fields) {
    if (!scheduleTarget) return;
    setScheduling(true);
    setScheduleError(null);

    const { data: userData, error: userErr } = await supabase.auth.getUser();

    if (userErr || !userData?.user?.id) {
      setScheduling(false);
      setScheduleError("You need to be signed in to schedule a visit.");
      return;
    }

    const { error: insertErr } = await supabase.from("events").insert({
      report_id: scheduleTarget.id,
      ...fields,
      created_by: userData.user.id,
    });

    setScheduling(false);

    if (insertErr) {
      setScheduleError(insertErr.message);
      return;
    }
    setScheduleTarget(null);
    setToast("Visit scheduled");
    fetchAssignments();
  }

  async function handleEventStatusChange(eventId, newStatus) {
    setEventBusyId(eventId);
    const { error: updateErr } = await supabase
      .from("events")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", eventId);
    setEventBusyId(null);

    if (updateErr) {
      setError(updateErr.message);
      return;
    }
    fetchAssignments();
  }

  const [showNewModal, setShowNewModal] = useState(false);
  const [openReports, setOpenReports] = useState([]);
  const [openLoading, setOpenLoading] = useState(false);
  const [openError, setOpenError] = useState(null);
  const [openSearch, setOpenSearch] = useState("");
  const [assigningId, setAssigningId] = useState(null);

  const fetchOpenReports = useCallback(async () => {
    setOpenLoading(true);
    setOpenError(null);

    const { data, error: fetchErr } = await supabase
      .from("reports")
      .select(`
        id, title, description, location, status, severity, votes, created_at,
        category_id,
        categories ( id, category_name ),
        report_images ( image_url, uploaded_at )
      `)
      .eq("status", OPEN_STATUS)
      .order("votes", { ascending: false })
      .order("created_at", { ascending: false });

    if (fetchErr) {
      setOpenError(fetchErr.message);
      setOpenLoading(false);
      return;
    }

    let leaderId = null;
    let maxVotes = 0;
    (data || []).forEach((r) => {
      const v = r.votes || 0;
      if (v > maxVotes) {
        maxVotes = v;
        leaderId = r.id;
      }
    });

    const normalized = (data || []).map((r) => {
      const categoryName = r.categories?.category_name || "Uncategorized";
      const votes = r.votes || 0;
      const isTopVoted = r.id === leaderId && votes > 0;

      return {
        ...r,
        votes,
        categoryName,
        title: deriveTitle(r.title, categoryName),
        photoUrl: firstReportPhoto(r.report_images),
        isTopVoted,
        severity: isTopVoted ? "High" : r.severity || "Low",
      };
    });

    setOpenReports(normalized);
    setOpenLoading(false);
  }, []);

  function openNewAssignmentModal() {
    setShowNewModal(true);
    setOpenSearch("");
    fetchOpenReports();
  }

  async function handleAssign(report, assigneeValue) {
    setAssigningId(report.id);
    setOpenError(null);

    const { error: updateErr } = await supabase
      .from("reports")
      .update({
        status: "under_review",
        title: report.title,
        assigned_to: assigneeValue,
        assigned_to_group_id: null,
        assigned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", report.id);

    setAssigningId(null);

    if (updateErr) {
      setOpenError(updateErr.message);
      return;
    }

    setOpenReports((list) => list.filter((r) => r.id !== report.id));
    setToast(`"${report.title}" assigned`);
  }

  const filteredOpenReports = useMemo(() => {
    if (!openSearch) return openReports;
    const t = openSearch.toLowerCase();
    return openReports.filter(
      (r) =>
        r.title.toLowerCase().includes(t) ||
        (r.categoryName || "").toLowerCase().includes(t) ||
        (r.location || "").toLowerCase().includes(t)
    );
  }, [openReports, openSearch]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  useEffect(() => {
    const channel = supabase
      .channel("assignments-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "reports" }, () => {
        fetchAssignments();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, () => {
        fetchAssignments();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAssignments]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  async function updateStatus(id, newStatus, successMessage) {
    const staysActive = ACTIVE_STATUSES.includes(newStatus);
    setBusyId(id);
    if (!staysActive) setRemovingId(id);

    const { error: updateErr } = await supabase
      .from("reports")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (updateErr) {
      setError(updateErr.message);
      setBusyId(null);
      setRemovingId(null);
      return;
    }

    if (staysActive) {
      setAssignments((list) => list.map((a) => (a.id === id ? { ...a, status: newStatus } : a)));
      setBusyId(null);
      setToast(successMessage);
      return;
    }

    setTimeout(() => {
      setAssignments((list) => list.filter((a) => a.id !== id));
      setRemovingId(null);
      setBusyId(null);
      setToast(successMessage);
    }, 260);
  }

  function handleStageChange(id, stageKey) {
    if (stageKey === "completed") {
      const target = assignments.find((a) => a.id === id);
      setCompleteTarget(target);
      return;
    }
    const stage = STAGE_OPTIONS.find((s) => s.key === stageKey);
    updateStatus(id, stage.dbStatus, `Set to ${stage.label}`);
  }

  async function confirmComplete(file, comment) {
    if (!completeTarget) return;
    setCompleting(true);
    setError(null);

    let proofUrl = null;

    if (file) {
      const ext = file.name.split('.').pop();
      const fileName = `proof_${completeTarget.id}_${Date.now()}.${ext}`;
      
      const { error: uploadErr } = await supabase.storage
        .from("images")
        .upload(fileName, file);

      if (uploadErr) {
        setError(uploadErr.message);
        setCompleting(false);
        return;
      }

      const { data: urlData } = supabase.storage
        .from("images")
        .getPublicUrl(fileName);
        
      proofUrl = urlData.publicUrl;
    }

    const { error: updateErr } = await supabase
      .from("reports")
      .update({
        status: "resolved",
        updated_at: new Date().toISOString(),
        ...(proofUrl ? { proof_image_url: proofUrl } : {}),
        ...(comment ? { resolution_notes: comment } : {})
      })
      .eq("id", completeTarget.id);

    setCompleting(false);

    if (updateErr) {
      setError(updateErr.message);
      return;
    }

    setToast("Report marked completed with proof and notes");
    setViewId(null); 

    const id = completeTarget.id;
    setCompleteTarget(null); 
    
    setRemovingId(id);
    setTimeout(() => {
      setAssignments((list) => list.filter((a) => a.id !== id));
      setRemovingId(null);
    }, 260);
  }

  function handleRejectConfirm() {
    const id = rejectId;
    setRejectId(null);
    setViewId(null);
    updateStatus(id, "rejected", "Report rejected");
  }

  const filtered = useMemo(() => {
    return assignments.filter((a) => {
      const matchesFilter =
        filter === "all" ? true :
        filter === "under_review" ? a.status === "under_review" :
        filter === "in_progress" ? a.status === "in_progress" :
        filter === "high" ? a.severity === "High" :
        filter === "stale" ? isStale(a) : true;
      if (!matchesFilter) return false;
      if (!search) return true;
      const t = search.toLowerCase();
      return (
        (a.title || "").toLowerCase().includes(t) ||
        (a.description || "").toLowerCase().includes(t) ||
        (a.categoryName || "").toLowerCase().includes(t) ||
        (a.location || "").toLowerCase().includes(t)
      );
    });
  }, [assignments, filter, search]);

  const viewedAssignment = assignments.find((a) => a.id === viewId) || null;
  const rejectingAssignment = assignments.find((a) => a.id === rejectId) || null;

  const filterTabs = [
    { key: "all", label: "All" },
    { key: "under_review", label: "Under Review" },
    { key: "in_progress", label: "In Progress" },
    { key: "high", label: "High Priority" },
    { key: "stale", label: "Stale (7d+)" },
  ];

  return (
    <div className="home-page" style={{ backgroundColor: "#f3f4f6", minHeight: "100vh", paddingTop: 20, paddingBottom: 0, paddingLeft: 40, paddingRight: 30 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: "0 0 3px", fontWeight: 800, letterSpacing: "-.01em", color: COLORS.ink900 }}>Assignments</h1>
          <p style={{ margin: 0, color: COLORS.ink500, fontSize: 11.5 }}>Reports currently in progress or under review, ordered by community vote count.</p>
        </div>
        <Btn variant="primary" onClick={openNewAssignmentModal}>
          <Plus size={13} /> New Assignment
        </Btn>
      </div>

      {error && (
        <div style={{ background: COLORS.red100, color: "#991B1B", borderRadius: 10, padding: "9px 12px", fontSize: 12, marginBottom: 14 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap", marginBottom: 13 }}>
        <div style={{ flex: 1, minWidth: 200, display: "flex", alignItems: "center", gap: 8, background: "#fff", border: `1px solid ${COLORS.ink200}`, borderRadius: 10, padding: "8px 12px" }}>
          <Search size={13} color={COLORS.ink500} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search assignments…"
            style={{ border: "none", outline: "none", fontSize: 12, fontFamily: "inherit", width: "100%", background: "transparent", color: COLORS.ink900 }}
          />
        </div>
        <div style={{ display: "flex", gap: 5, background: "#fff", border: `1px solid ${COLORS.ink200}`, borderRadius: 10, padding: 3, flexWrap: "wrap" }}>
          {filterTabs.map((tab) => (
            <div
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              style={{
                padding: "6px 11px",
                borderRadius: 7,
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
                background: filter === tab.key ? COLORS.green600 : "transparent",
                color: filter === tab.key ? "#fff" : COLORS.ink500,
              }}
            >
              {tab.label}
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 11, color: COLORS.ink500, marginBottom: 11 }}>
        {loading ? "Loading assignments…" : `Showing ${filtered.length} of ${assignments.length} assignment${assignments.length !== 1 ? "s" : ""}`}
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "60px 0", color: COLORS.ink500 }}>
          <Loader2 size={22} style={{ animation: "spin 1s linear infinite" }} />
        </div>
      ) : assignments.length === 0 ? (
        <EmptyState title="No active assignments" text="Reports move here automatically once they're set to In Progress or Under Review." />
      ) : filtered.length === 0 ? (
        <EmptyState title="No matching assignments" text="Try a different search term or filter." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: 12 }}>
          {filtered.map((a) => (
            <AssignmentCard
              key={a.id}
              a={a}
              removing={removingId === a.id}
              busy={busyId === a.id}
              onView={setViewId}
              onStageChange={handleStageChange}
              onReject={setRejectId}
              staffNameById={staffNameById}
            />
          ))}
        </div>
      )}

      <ViewModal
        assignment={viewedAssignment}
        busy={busyId === viewId}
        savingAssignedTo={savingAssignedTo}
        onSaveAssignedTo={saveAssignedTo}
        onOpenSchedule={openSchedule}
        onEventStatusChange={handleEventStatusChange}
        eventBusyId={eventBusyId}
        onClose={() => setViewId(null)}
        onStageChange={handleStageChange}
        onReject={setRejectId}
        staffOptions={staffOptions}
        staffNameById={staffNameById}
      />
      <CompleteModal
        assignment={completeTarget}
        onCancel={() => setCompleteTarget(null)}
        onConfirm={confirmComplete}
        completing={completing}
      />
      <RejectModal
        assignment={rejectingAssignment}
        onCancel={() => setRejectId(null)}
        onConfirm={handleRejectConfirm}
      />
      <ScheduleEventModal
        report={scheduleTarget}
        saving={scheduling}
        error={scheduleError}
        onCancel={() => setScheduleTarget(null)}
        onSubmit={submitSchedule}
      />
      <NewAssignmentModal
        open={showNewModal}
        loading={openLoading}
        error={openError}
        reports={filteredOpenReports}
        search={openSearch}
        onSearch={setOpenSearch}
        onAssign={handleAssign}
        assigningId={assigningId}
        onClose={() => setShowNewModal(false)}
        staffOptions={staffOptions}
      />
      <Toast message={toast} />
      <Footer/>
    </div>
  );
}