import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup, Circle, Polygon, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Droplet,
  Zap,
  TriangleAlert,
  MapPin,
  Calendar,
  User,
  FileText,
  CheckCircle2,
  MessageSquare,
  Send,
  Trash2,
  Flame,
  Camera,
  Image as ImageIcon,
  Navigation,
  Undo2,
  X,
} from "lucide-react";
import Sidebar from "../components/Sidebar";
import Footer from "../components/footer";
import { supabase } from "../components/supabaseClient";

const COLORS = {
  green900: "#064E3B",
  green700: "#047857",
  green600: "#059669",
  green100: "#ECFDF5",
  amber500: "#F59E0B",
  amber100: "#FFFBEB",
  blue500: "#2563EB",
  blue100: "#EFF6FF",
  emerald500: "#10B981",
  emerald100: "#D1FAE5",
  purple500: "#7C3AED",
  purple100: "#F5F3FF",
  red500: "#EF4444",
  red100: "#FEF2F2",
  ink900: "#111827",
  ink700: "#374151",
  ink500: "#6B7280",
  ink300: "#D1D5DB",
  ink200: "#E5E7EB",
  ink100: "#F9FAFB",
  surface: "#FFFFFF",
};

const cardShadow = "0 12px 30px rgba(16, 24, 40, 0.05)";
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const REPORT_MEDIA_BUCKET = "images";

const TSHWANE_BOUNDARY = [
  [-25.42, 27.93], [-25.35, 28.15], [-25.33, 28.35], [-25.40, 28.55],
  [-25.55, 28.62], [-25.75, 28.58], [-25.90, 28.45], [-25.95, 28.25],
  [-25.90, 28.05], [-25.78, 27.90], [-25.60, 27.85], [-25.42, 27.93],
];

const TSHWANE_BOUNDS = L.latLngBounds(TSHWANE_BOUNDARY.map((p) => L.latLng(p[0], p[1])));
const DEFAULT_MAP_CENTER = [-25.7461, 28.1881];

const MAP_LAYERS = {
  street: {
    label: "Street",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  satellite: {
    label: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    labelsUrl:
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
  },
};

const markerColors = {
  resolved: "#059669",
  "in-progress": "#f59e0b",
  "under-review": "#8b5cf6",
  unresolved: "#ef4444",
};

const mapFilterOptions = ["all", "resolved", "in-progress", "under-review", "unresolved"];
const mapFilterLabels = {
  all: "All Issues",
  resolved: "Resolved",
  "in-progress": "In Progress",
  "under-review": "Under Review",
  unresolved: "Unresolved",
};

const chartFilterOptions = ["all", ...mapFilterOptions.slice(1)];
const chartFilterLabels = {
  all: "All Statuses",
  resolved: "Resolved / Closed",
  "in-progress": "In Progress",
  "under-review": "Under Review",
  unresolved: "Open / Unresolved",
};

const CATEGORY_VISUALS = [
  { test: (n) => n.includes("water"), icon: Droplet, color: "#3b82f6" },
  { test: (n) => n.includes("road") || n.includes("infrastructure"), icon: TriangleAlert, color: "#f59e0b" },
  { test: (n) => n.includes("util") || n.includes("sanitation"), icon: Trash2, color: "#059669" },
  { test: (n) => n.includes("safety") || n.includes("light"), icon: MapPin, color: "#ef4444" },
];
const FALLBACK_VISUAL = { icon: Flame, color: "#a855f7" };

function getCategoryVisual(categoryName) {
  const name = (categoryName || "").toLowerCase();
  const match = CATEGORY_VISUALS.find((c) => c.test(name));
  return match || FALLBACK_VISUAL;
}

function markerStatus(status) {
  if (status === "in_progress") return "in-progress";
  if (status === "resolved" || status === "closed") return "resolved";
  if (status === "under_review") return "under-review";
  return "unresolved"; 
}

const STATUS_META = {
  Assigned: { label: "Assigned", fg: COLORS.blue500, bg: COLORS.blue100 },
  "In Progress": { label: "In Progress", fg: COLORS.amber500, bg: COLORS.amber100 },
  "Under Review": { label: "Under Review", fg: COLORS.purple500, bg: COLORS.purple100 },
  Completed: { label: "Completed", fg: COLORS.green700, bg: COLORS.green100 },
  Rejected: { label: "Rejected", fg: COLORS.red500, bg: COLORS.red100 },
};

const STATUS_DISPLAY = {
  open: "Assigned",
  in_progress: "In Progress",
  under_review: "Under Review",
  resolved: "Completed",
  closed: "Completed",
  rejected: "Rejected",
};

function statusToDisplay(status) {
  return STATUS_DISPLAY[status] || status || "Assigned";
}

function actionLabelForStatus(status) {
  if (status === "in_progress") return "Continue Work";
  if (status === "resolved" || status === "closed" || status === "rejected") return "View Report";
  return "Start Attendance";
}

function shortId(id) {
  return id ? `#${String(id).slice(0, 6).toUpperCase()}` : "#\u2013";
}

const HOW_IT_WORKS = [
  { step: 1, title: "Start Attendance", desc: "Tap when you arrive on location", bg: COLORS.green100, fg: COLORS.green700 },
  { step: 2, title: "Resolve Issue", desc: "Complete the assigned work", bg: COLORS.blue100, fg: COLORS.blue500 },
  { step: 3, title: "Upload Photo", desc: "Take a photo of the resolved issue", bg: COLORS.purple100, fg: COLORS.purple500 },
  { step: 4, title: "Finish Issue", desc: "Tap to finish, log your time and leave a comment", bg: COLORS.green100, fg: COLORS.green700 },
];

function statusColors(status) {
  return STATUS_META[status] || { fg: COLORS.ink700, bg: COLORS.ink200 };
}

function priorityColor(priority) {
  if (priority === "High") return COLORS.red500;
  if (priority === "Medium") return COLORS.amber500;
  return COLORS.green700;
}

const dateFormatter = new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short" });
const timeFormatter = new Intl.DateTimeFormat("en-ZA", { hour: "2-digit", minute: "2-digit" });

function makeStatusDivIcon(statusKey) {
  const color = markerColors[statusKey] || markerColors.unresolved;
  const html = `
    <div style="
      width:34px;height:34px;border-radius:50% 50% 50% 0;
      background:${color};transform:rotate(-45deg);
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 2px 5px rgba(0,0,0,0.35);
      border:2px solid #ffffff;
    ">
      <span style="transform:rotate(45deg);color:#ffffff;font-size:14px;">&#x25CF;</span>
    </div>
  `;
  return L.divIcon({
    html,
    className: "trackserv-marker-icon",
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -32],
  });
}

function BoundsEnforcer() {
  const map = useMap();
  useEffect(() => {
    map.setMaxBounds(TSHWANE_BOUNDS.pad(0.05));
    map.setMinZoom(10);
    map.on("drag", () => {
      map.panInsideBounds(TSHWANE_BOUNDS, { animate: false });
    });
  }, [map]);
  return null;
}

export default function Dashboard({ name = "trackserv-dashboard-root" }) {
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState(null);
  const [reports, setReports] = useState([]);
  const [resolutions, setResolutions] = useState({});
  const [loadingReports, setLoadingReports] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [selectedIssueId, setSelectedIssueId] = useState(null);
  const selectedIssue = reports.find((i) => i.id === selectedIssueId) || reports[0] || null;

  const [selectedCategory, setSelectedCategory] = useState("all");
  const [mapFilter, setMapFilter] = useState("all");
  const [mapLayer, setMapLayer] = useState("street");
  const [chartFilter, setChartFilter] = useState("all");

  const [myLocation, setMyLocation] = useState(null);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [routeInfo, setRouteInfo] = useState(null);

  const [completionStep, setCompletionStep] = useState("idle"); 
  const [completionFile, setCompletionFile] = useState(null);
  const [completionPreviewUrl, setCompletionPreviewUrl] = useState(null);
  const [completionNote, setCompletionNote] = useState("");
  const [submittingCompletion, setSubmittingCompletion] = useState(false);
  const [completionError, setCompletionError] = useState("");

  const [viewDetailsIssue, setViewDetailsIssue] = useState(null);

  useEffect(() => {
    setCompletionStep("idle");
    setCompletionFile(null);
    setCompletionNote("");
    setCompletionError("");
    setCompletionPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }, [selectedIssueId]);

  const idleTimerRef = useRef(null);
  useEffect(() => {
    const resetIdleTimer = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(async () => {
        await supabase.auth.signOut();
        navigate("/login", { replace: true });
      }, IDLE_TIMEOUT_MS);
    };

    const activityEvents = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
    activityEvents.forEach((evt) => window.addEventListener(evt, resetIdleTimer));
    resetIdleTimer();

    return () => {
      activityEvents.forEach((evt) => window.removeEventListener(evt, resetIdleTimer));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [navigate]);

  useEffect(() => {
    let isMounted = true;
    async function loadCurrentUser() {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      if (!user) return;
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("id, username, full_name, role")
        .eq("id", user.id)
        .single();
      if (!error && isMounted) setCurrentUser(profile);
    }
    loadCurrentUser();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!currentUser?.id) return;
    let isMounted = true;

    async function loadReports() {
      setLoadingReports(true);
      setLoadError("");

      const { data, error } = await supabase
        .from("reports")
        .select(
          "id, title, description, location, latitude, longitude, status, severity, created_at, assigned_at, proof_image_url, categories(category_name), report_images(image_url)"
        )
        .eq("assigned_to", currentUser.id)
        .order("assigned_at", { ascending: false });

      if (error) {
        if (isMounted) {
          setLoadError("Couldn't load your assigned issues.");
          setLoadingReports(false);
        }
        return;
      }

      const reportRows = data || [];
      if (isMounted) {
        setReports(reportRows);
        setSelectedIssueId((current) => current || reportRows[0]?.id || null);
        setLoadingReports(false);
      }

      if (reportRows.length) {
        const ids = reportRows.map((r) => r.id);
        const { data: resolutionRows, error: resError } = await supabase
          .from("issue_resolutions")
          .select("*")
          .in("report_id", ids);
        if (!resError && isMounted) {
          const map = {};
          (resolutionRows || []).forEach((row) => {
            map[row.report_id] = row;
          });
          setResolutions(map);
        }
      }
    }

    loadReports();
    return () => {
      isMounted = false;
    };
  }, [currentUser?.id]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setMyLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setMyLocation(null)
    );
  }, []);

  useEffect(() => {
    if (!myLocation || selectedIssue?.latitude == null || selectedIssue?.longitude == null) {
      setRouteCoordinates([]);
      setRouteInfo(null);
      return;
    }

    let cancelled = false;
    async function fetchRoute() {
      try {
        const origin = `${myLocation.lng},${myLocation.lat}`;
        const destination = `${selectedIssue.longitude},${selectedIssue.latitude}`;
        const res = await fetch(
          `https://router.project-osrm.org/route/v1/driving/${origin};${destination}?overview=full&geometries=geojson`
        );
        const data = await res.json();
        if (cancelled) return;

        const route = data?.routes?.[0];
        if (route?.geometry?.coordinates) {
          setRouteCoordinates(route.geometry.coordinates.map(([lng, lat]) => [lat, lng]));
          setRouteInfo({
            distanceKm: (route.distance / 1000).toFixed(1),
            durationMin: Math.round(route.duration / 60),
          });
        } else {
          setRouteCoordinates([]);
          setRouteInfo(null);
        }
      } catch (err) {
        if (!cancelled) {
          setRouteCoordinates([]);
          setRouteInfo(null);
        }
      }
    }

    fetchRoute();
    return () => {
      cancelled = true;
    };
  }, [myLocation, selectedIssue?.latitude, selectedIssue?.longitude]);

  const mapPoints = useMemo(() => {
    return reports
      .filter((r) => r.latitude != null && r.longitude != null)
      .filter((r) => selectedCategory === "all" || r.categories?.category_name === selectedCategory)
      .map((r) => ({
        id: r.id,
        position: [Number(r.latitude), Number(r.longitude)],
        status: markerStatus(r.status),
        title: r.title || r.description || "Report",
        category: r.categories?.category_name
      }));
  }, [reports, selectedCategory]);

  const filteredMapMarkers = useMemo(
    () => (mapFilter === "all" ? mapPoints : mapPoints.filter((m) => m.status === mapFilter)),
    [mapPoints, mapFilter]
  );

  const mapCenter = useMemo(() => {
    if (mapPoints.length === 0) return DEFAULT_MAP_CENTER;
    const [latSum, lngSum] = mapPoints.reduce(
      ([lat, lng], m) => [lat + m.position[0], lng + m.position[1]],
      [0, 0]
    );
    return [latSum / mapPoints.length, lngSum / mapPoints.length];
  }, [mapPoints]);

  const activeAssignments = useMemo(
    () => reports.filter((r) => !["resolved", "closed"].includes(r.status)),
    [reports]
  );

  const workHistory = useMemo(() => {
    return reports.map((r) => {
      const resolution = resolutions[r.id];
      return {
        id: r.id,
        type: r.categories?.category_name || "General",
        location: r.location,
        checkIn: r.assigned_at ? timeFormatter.format(new Date(r.assigned_at)) : "\u2013",
        checkOut: resolution?.attended_at ? timeFormatter.format(new Date(resolution.attended_at)) : "\u2013",
        status: statusToDisplay(r.status),
      };
    });
  }, [reports, resolutions]);

  const handleMapFilterClick = () => {
    const currentIndex = mapFilterOptions.indexOf(mapFilter);
    const nextIndex = (currentIndex + 1) % mapFilterOptions.length;
    setMapFilter(mapFilterOptions[nextIndex]);
  };

  const handleChartFilterClick = () => {
    const currentIndex = chartFilterOptions.indexOf(chartFilter);
    const nextIndex = (currentIndex + 1) % chartFilterOptions.length;
    setChartFilter(chartFilterOptions[nextIndex]);
  };

  const startAttendance = async () => {
    if (!selectedIssue) return;
    const startedAt = new Date().toISOString();

    let { error } = await supabase
      .from("reports")
      .update({ status: "in_progress", started_at: startedAt })
      .eq("id", selectedIssue.id);

    if (error) {
      const fallback = await supabase
        .from("reports")
        .update({ status: "in_progress" })
        .eq("id", selectedIssue.id);
      error = fallback.error;
    }

    if (error) {
      console.error("Error starting attendance:", error.message);
      return;
    }

    setReports((current) =>
      current.map((r) => (r.id === selectedIssue.id ? { ...r, status: "in_progress", started_at: startedAt } : r))
    );
  };

  const handleCompletionFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setCompletionFile(file);
    setCompletionPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
    setCompletionStep("review");
    event.target.value = "";
  };

  const handleSubmitCompletion = async () => {
    if (!selectedIssue || !completionFile) return;
    setSubmittingCompletion(true);
    setCompletionError("");

    const attendantName = currentUser?.full_name || currentUser?.username || "Staff";
    const completedAt = new Date().toISOString();

    try {
      const filePath = `${selectedIssue.id}/${Date.now()}-${completionFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from(REPORT_MEDIA_BUCKET)
        .upload(filePath, completionFile);
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from(REPORT_MEDIA_BUCKET).getPublicUrl(filePath);
      const imageUrl = publicUrlData?.publicUrl;

      const { data: reportImageRow, error: reportImageError } = await supabase
        .from("report_images")
        .insert({ report_id: selectedIssue.id, image_url: imageUrl })
        .select()
        .single();
      if (reportImageError) throw reportImageError;

      const existing = resolutions[selectedIssue.id];
      const payload = {
        attendant_name: attendantName,
        resolution_note: completionNote.trim(),
        resolution_image_url: imageUrl,
        attended_at: completedAt,
      };

      let resolutionRow;
      if (existing) {
        const { data, error } = await supabase
          .from("issue_resolutions")
          .update(payload)
          .eq("id", existing.id)
          .select()
          .single();
        if (error) throw error;
        resolutionRow = data;
      } else {
        const { data, error } = await supabase
          .from("issue_resolutions")
          .insert({ report_id: selectedIssue.id, ...payload })
          .select()
          .single();
        if (error) throw error;
        resolutionRow = data;
      }

      const { error: statusError } = await supabase
        .from("reports")
        .update({ status: "resolved" })
        .eq("id", selectedIssue.id);
      if (statusError) throw statusError;

      setResolutions((current) => ({ ...current, [selectedIssue.id]: resolutionRow }));
      setReports((current) =>
        current.map((r) =>
          r.id === selectedIssue.id
            ? { ...r, status: "resolved", report_images: [...(r.report_images || []), reportImageRow] }
            : r
        )
      );
      setCompletionStep("idle");
      setCompletionFile(null);
      setCompletionNote("");
      setCompletionPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
    } catch (err) {
      console.error("Error submitting completion:", err.message);
      setCompletionError("Couldn't submit — please try again.");
    } finally {
      setSubmittingCompletion(false);
    }
  };

  const handleUndoStep = async () => {
    if (!selectedIssue) return;

    if (completionStep === "review") {
      setCompletionFile(null);
      setCompletionPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      setCompletionNote("");
      setCompletionStep("capture");
      return;
    }

    if (completionStep === "capture") {
      setCompletionStep("idle");
      return;
    }

    if (selectedIssue.status === "resolved" || selectedIssue.status === "closed") {
      const { error } = await supabase.from("reports").update({ status: "in_progress" }).eq("id", selectedIssue.id);
      if (error) return;
      setReports((current) => current.map((r) => (r.id === selectedIssue.id ? { ...r, status: "in_progress" } : r)));
      return;
    }

    if (selectedIssue.status === "in_progress") {
      let { error } = await supabase
        .from("reports")
        .update({ status: "open", started_at: null })
        .eq("id", selectedIssue.id);
      if (error) {
        const fallback = await supabase.from("reports").update({ status: "open" }).eq("id", selectedIssue.id);
        error = fallback.error;
      }
      if (error) return;
      setReports((current) =>
        current.map((r) => (r.id === selectedIssue.id ? { ...r, status: "open", started_at: null } : r))
      );
    }
  };

  const canUndo = selectedIssue
    ? selectedIssue.status !== "open" || completionStep !== "idle"
    : false;

  const selectedIssueResolution = selectedIssue ? resolutions[selectedIssue.id] : null;
  const isSelectedIssueDone = selectedIssue ? ["resolved", "closed"].includes(selectedIssue.status) : false;
  const selectedIssueComments = selectedIssueResolution?.resolution_note
    ? [
        {
          id: selectedIssueResolution.id,
          text: selectedIssueResolution.resolution_note,
          author: selectedIssueResolution.attendant_name,
          timestamp: new Date(selectedIssueResolution.attended_at || selectedIssueResolution.created_at),
        },
      ]
    : [];

  return (
    <Sidebar activePage="dashboard" selectedCategory={selectedCategory} onCategoryChange={setSelectedCategory}>
      <style>{`
        .dashboard-content-grid {
          display: grid;
          gap: 20px;
          align-items: start;
        }
        .dashboard-map-card {
          height: 460px;
        }

        /* Mobile View */
        @media (max-width: 767px) {
          .dashboard-content-grid {
            grid-template-columns: 1fr;
          }
          .dashboard-map-card {
            height: 350px;
          }
          .dashboard-page-shell {
            padding: 12px;
          }
        }
        
        /* Tablet View */
        @media (min-width: 768px) and (max-width: 1023px) {
          .dashboard-content-grid {
            grid-template-columns: minmax(0, 1fr) 320px;
          }
        }
        
        /* Desktop View */
        @media (min-width: 1024px) {
          .dashboard-content-grid {
            grid-template-columns: minmax(0, 1fr) minmax(0, 420px);
          }
        }
      `}</style>
      
      <div
        name="dashboard-page-wrapper"
        className="home-page dashboard-page"
        style={{
          backgroundColor: COLORS.ink100,
          minHeight: "100%",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          color: COLORS.ink900,
        }}
      >
        <div
          name="dashboard-page-shell"
          className="dashboard-page-shell"
          style={{
            maxWidth: 1300,
            margin: "0 auto",
            width: "100%",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            gap: 20,
            padding: 20,
          }}
        >
          <div
            name="dashboard-page-header"
            className="dashboard-page-header"
            style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}
          >
            <div name="dashboard-page-heading">
              <h1 name="dashboard-page-title" style={{ margin: "0 0 3px", fontWeight: 800, letterSpacing: "-.01em", color: COLORS.ink900, fontSize: 24 }}>
                My Assignments
              </h1>
            </div>
            
            <button
              onClick={handleChartFilterClick}
              style={{
                backgroundColor: COLORS.surface,
                border: `1px solid ${COLORS.ink200}`,
                padding: "8px 16px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
              }}
            >
              Chart Filter: {chartFilterLabels[chartFilter]}
            </button>
          </div>

          <div
            name="dashboard-content-grid"
            className="dashboard-content-grid"
          >
            <div name="dashboard-left-column" style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
              
              <div
                name="map-card"
                className="dashboard-card dashboard-map-card"
                style={{ backgroundColor: COLORS.surface, borderRadius: 20, zIndex: 1, border: `1px solid ${COLORS.ink200}`, boxShadow: cardShadow, overflow: "hidden", position: "relative" }}
              >
                <div
                  name="map-legend-box"
                  className="dashboard-map-legend"
                  style={{ position: "absolute", top: 14, left: 14, zIndex: 500, backgroundColor: COLORS.surface, borderRadius: 14, border: `1px solid ${COLORS.ink200}`, padding: "12px 16px", boxShadow: cardShadow, minWidth: 150 }}
                >
                  
                  
                  <button
                    onClick={handleMapFilterClick}
                    style={{
                      width: "100%",
                      padding: "6px",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      border: `1px solid ${COLORS.ink200}`,
                      borderRadius: 6,
                      background: COLORS.ink100,
                      color: COLORS.ink900
                    }}
                  >
                    Filter: {mapFilterLabels[mapFilter]}
                  </button>

                  {routeInfo && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: COLORS.ink700, marginTop: 8 }}>
                      <Navigation size={12} color={COLORS.blue500} />
                      {routeInfo.distanceKm} km {"\u2022"} {routeInfo.durationMin} min drive
                    </div>
                  )}

                  <button
                    onClick={() => {
                      if (!myLocation || !selectedIssue?.latitude || !selectedIssue?.longitude) return;
                      const url = `https://www.google.com/maps/dir/?api=1&origin=${myLocation.lat},${myLocation.lng}&destination=${selectedIssue.latitude},${selectedIssue.longitude}&travelmode=driving`;
                      window.open(url, "_blank", "noopener,noreferrer");
                    }}
                    disabled={!myLocation || !selectedIssue?.latitude}
                    title={!myLocation ? "Waiting for your location…" : "Open turn-by-turn voice directions"}
                    style={{
                      width: "100%",
                      marginTop: 6,
                      padding: "6px",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: myLocation && selectedIssue?.latitude ? "pointer" : "not-allowed",
                      border: "none",
                      borderRadius: 6,
                      background: myLocation && selectedIssue?.latitude ? COLORS.blue500 : COLORS.ink200,
                      color: myLocation && selectedIssue?.latitude ? "#FFFFFF" : COLORS.ink500,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    <Navigation size={12} />
                    Open in Maps App
                  </button>
                </div>

                <div
                  name="map-layer-toggle"
                  className="dashboard-map-layer-toggle"
                  style={{
                    position: "absolute",
                    top: 14,
                    right: 14,
                    zIndex: 500,
                    display: "flex",
                    backgroundColor: COLORS.surface,
                    borderRadius: 10,
                    border: `1px solid ${COLORS.ink200}`,
                    boxShadow: cardShadow,
                    padding: 3,
                    gap: 2,
                  }}
                >
                  {Object.entries(MAP_LAYERS).map(([key, layer]) => (
                    <button
                      key={key}
                      onClick={() => setMapLayer(key)}
                      style={{
                        padding: "6px 12px",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                        border: "none",
                        borderRadius: 7,
                        background: mapLayer === key ? COLORS.green700 : "transparent",
                        color: mapLayer === key ? "#FFFFFF" : COLORS.ink700,
                      }}
                    >
                      {layer.label}
                    </button>
                  ))}
                </div>

                <MapContainer
                  name="tshwane-leaflet-map"
                  center={mapCenter}
                  zoom={12}
                  minZoom={10}
                  maxBounds={TSHWANE_BOUNDS.pad(0.05)}
                  maxBoundsViscosity={1.0}
                  style={{ width: "100%", height: "100%" }}
                >
                  <TileLayer
                    key={mapLayer}
                    url={MAP_LAYERS[mapLayer].url}
                    attribution={MAP_LAYERS[mapLayer].attribution}
                  />
                  {mapLayer === "satellite" && (
                    <TileLayer url={MAP_LAYERS.satellite.labelsUrl} />
                  )}

                  <BoundsEnforcer />

                  <Polygon
                    positions={TSHWANE_BOUNDARY}
                    pathOptions={{ color: COLORS.green600, weight: 2, fillOpacity: 0.03, dashArray: "6 6" }}
                  />

                  {myLocation && (
                    <React.Fragment>
                      <Circle
                        center={[myLocation.lat, myLocation.lng]}
                        radius={220}
                        pathOptions={{ color: COLORS.blue500, fillColor: COLORS.blue500, fillOpacity: 0.15, weight: 1 }}
                      />
                      <Marker
                        position={[myLocation.lat, myLocation.lng]}
                        icon={L.divIcon({
                          html: `<div style="width:16px;height:16px;border-radius:50%;background:${COLORS.blue500};border:3px solid #ffffff;box-shadow:0 0 0 2px ${COLORS.blue500};"></div>`,
                          className: "trackserv-you-are-here-icon",
                          iconSize: [16, 16],
                          iconAnchor: [8, 8],
                        })}
                      >
                        <Popup>You are here</Popup>
                      </Marker>
                    </React.Fragment>
                  )}

                  {routeCoordinates.length > 0 ? (
                    <Polyline
                      positions={routeCoordinates}
                      pathOptions={{ color: COLORS.blue500, weight: 5, opacity: 0.85 }}
                    />
                  ) : (
                    myLocation &&
                    selectedIssue?.latitude != null &&
                    selectedIssue?.longitude != null && (
                      <Polyline
                        positions={[
                          [myLocation.lat, myLocation.lng],
                          [Number(selectedIssue.latitude), Number(selectedIssue.longitude)],
                        ]}
                        pathOptions={{ color: COLORS.blue500, weight: 3, dashArray: "8 6" }}
                      />
                    )
                  )}

                  {filteredMapMarkers.map((marker) => (
                    <Marker
                      key={marker.id}
                      position={marker.position}
                      icon={makeStatusDivIcon(marker.status)}
                      eventHandlers={{ click: () => setSelectedIssueId(marker.id) }}
                    >
                      <Popup>
                        <strong>{marker.id}</strong> {marker.title}
                        <br />
                        Status: <span style={{ textTransform: "capitalize" }}>{marker.status.replace("-", " ")}</span>
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </div>

              <div name="assigned-issues-card" style={{ backgroundColor: COLORS.surface, borderRadius: 20, border: `1px solid ${COLORS.ink200}`, boxShadow: cardShadow, padding: 20 }}>
                <div name="assigned-issues-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div name="assigned-issues-title" style={{ fontWeight: 700, fontSize: 16, color: COLORS.ink900 }}>
                    My Assigned Issues ({activeAssignments.length})
                  </div>
                  <span name="assigned-issues-view-all" style={{ fontSize: 13, color: COLORS.green700, cursor: "pointer", fontWeight: 600 }}>
                    View all
                  </span>
                </div>

                {loadingReports && (
                  <div style={{ fontSize: 13, color: COLORS.ink500, padding: "8px 0" }}>Loading your assignments…</div>
                )}
                {loadError && (
                  <div style={{ fontSize: 13, color: COLORS.red500, padding: "8px 0" }}>{loadError}</div>
                )}
                {!loadingReports && !loadError && activeAssignments.length === 0 && (
                  <div style={{ fontSize: 13, color: COLORS.ink500, padding: "8px 0" }}>
                    You have no assigned issues right now.
                  </div>
                )}

                <div name="assigned-issues-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
                  {activeAssignments.map((issue) => {
                    const visual = getCategoryVisual(issue.categories?.category_name);
                    const Icon = visual.icon;
                    const displayStatus = statusToDisplay(issue.status);
                    const sc = statusColors(displayStatus);
                    const isSelected = issue.id === selectedIssueId;
                    const actionLabel = actionLabelForStatus(issue.status);
                    
                    return (
                      <div
                        key={issue.id}
                        onClick={() => setSelectedIssueId(issue.id)}
                        style={{
                          border: isSelected ? `2px solid ${COLORS.green600}` : `1px solid ${COLORS.ink200}`,
                          borderRadius: 16,
                          padding: 14,
                          cursor: "pointer",
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                          backgroundColor: COLORS.surface,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span
                            style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: COLORS.ink100, color: visual.color, display: "flex", alignItems: "center", justifyContent: "center" }}
                          >
                            <Icon size={16} />
                          </span>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13, color: COLORS.ink900 }}>{shortId(issue.id)}</div>
                            <div style={{ fontSize: 12, color: COLORS.ink500 }}>{issue.categories?.category_name || "General"}</div>
                          </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: COLORS.ink700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          <MapPin size={12} color={COLORS.ink500} style={{ flexShrink: 0 }} />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{issue.location}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: COLORS.ink500 }}>
                          <Calendar size={11} color={COLORS.ink500} style={{ flexShrink: 0 }} />
                          Reported: {issue.created_at ? dateFormatter.format(new Date(issue.created_at)) : "\u2013"}
                        </div>

                        <div style={{ fontSize: 12, color: COLORS.ink700 }}>
                          Status: <span style={{ color: sc.fg, fontWeight: 600 }}>{displayStatus}</span>
                        </div>
                        <div style={{ fontSize: 12, color: COLORS.ink700 }}>
                          Priority: <span style={{ color: priorityColor(issue.severity), fontWeight: 600 }}>{issue.severity}</span>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedIssueId(issue.id);
                          }}
                          style={{
                            marginTop: 6,
                            backgroundColor: actionLabel === "Continue Work" ? COLORS.surface : COLORS.green600,
                            color: actionLabel === "Continue Work" ? COLORS.green700 : "#FFFFFF",
                            border: actionLabel === "Continue Work" ? `1px solid ${COLORS.green600}` : "none",
                            borderRadius: 10,
                            padding: 9,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {actionLabel}
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewDetailsIssue(issue);
                          }}
                          style={{
                            backgroundColor: COLORS.surface,
                            color: COLORS.ink700,
                            border: `1px solid ${COLORS.ink200}`,
                            borderRadius: 10,
                            padding: 9,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 6,
                          }}
                        >
                          <FileText size={12} />
                          View Report Details
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div name="how-it-works-card" style={{ backgroundColor: COLORS.surface, borderRadius: 20, border: `1px solid ${COLORS.ink200}`, boxShadow: cardShadow, padding: 20 }}>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16, color: COLORS.ink900 }}>
                  How it works
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                  {HOW_IT_WORKS.map((step, idx) => (
                    <React.Fragment key={step.step}>
                      <div style={{ display: "flex", gap: 10, flex: 1, minWidth: 160 }}>
                        <div
                          style={{ width: 40, height: 40, borderRadius: "50%", backgroundColor: step.bg, color: step.fg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, flexShrink: 0 }}
                        >
                          {step.step}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13, color: COLORS.ink900 }}>
                            {step.step}. {step.title}
                          </div>
                          <div style={{ fontSize: 12, color: COLORS.ink500 }}>{step.desc}</div>
                        </div>
                      </div>
                      {idx < HOW_IT_WORKS.length - 1 && (
                        <div style={{ color: COLORS.ink300, fontSize: 18, alignSelf: "center" }}>{"\u2192"}</div>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>

            <div name="dashboard-right-column" style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
              <div
                name="issue-details-card"
                style={{
                  backgroundColor: COLORS.surface,
                  borderRadius: 20,
                  border: `1px solid ${COLORS.ink200}`,
                  boxShadow: cardShadow,
                  padding: 20,
                  boxSizing: "border-box",
                  width: "100%",
                  overflow: "hidden",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: COLORS.ink900 }}>Issue Details</div>
                  <span style={{ cursor: "pointer", color: COLORS.ink500 }}>{"\u2715"}</span>
                </div>

                {!selectedIssue ? (
                  <div style={{ fontSize: 13, color: COLORS.ink500 }}>
                    {loadingReports ? "Loading…" : "No issue selected."}
                  </div>
                ) : (
                  <React.Fragment>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                      <span style={{ backgroundColor: COLORS.ink900, color: "#FFFFFF", fontSize: 12, fontWeight: 700, padding: "3px 8px", borderRadius: 8 }}>
                        {shortId(selectedIssue.id)}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: 14, color: COLORS.ink900 }}>{selectedIssue.categories?.category_name || "General"}</span>
                      <span
                        style={{ backgroundColor: statusColors(statusToDisplay(selectedIssue.status)).bg, color: statusColors(statusToDisplay(selectedIssue.status)).fg, fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 999 }}
                      >
                        {statusToDisplay(selectedIssue.status)}
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: 180, display: "flex", flexDirection: "column", gap: 8, overflowWrap: "break-word" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: COLORS.ink700 }}>
                          <MapPin size={14} color={COLORS.ink500} style={{ flexShrink: 0 }} />
                          <span style={{ overflowWrap: "anywhere" }}>{selectedIssue.location}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: COLORS.ink700 }}>
                          <Calendar size={14} color={COLORS.ink500} style={{ flexShrink: 0 }} />
                          Reported: {selectedIssue.created_at ? dateFormatter.format(new Date(selectedIssue.created_at)) : "\u2013"}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: COLORS.ink700 }}>
                          <TriangleAlert size={14} color={priorityColor(selectedIssue.severity)} style={{ flexShrink: 0 }} />
                          Priority: <span style={{ color: priorityColor(selectedIssue.severity), fontWeight: 600 }}>{selectedIssue.severity}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: COLORS.ink700 }}>
                          <User size={14} color={COLORS.ink500} style={{ flexShrink: 0 }} />
                          Assigned to: {currentUser?.full_name || currentUser?.username || "Unassigned"}
                        </div>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 13, color: COLORS.ink700 }}>
                          <FileText size={14} color={COLORS.ink500} style={{ marginTop: 2, flexShrink: 0 }} />
                          <span style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>
                            Description: {selectedIssue.description || selectedIssue.title || "No description provided."}
                          </span>
                        </div>
                      </div>

                      {(selectedIssue.report_images?.[0]?.image_url || selectedIssue.proof_image_url) && (
                        <img
                          alt={`${selectedIssue.categories?.category_name || "Issue"} at ${selectedIssue.location}`}
                          src={selectedIssue.report_images?.[0]?.image_url || selectedIssue.proof_image_url}
                          style={{ width: 140, height: 110, borderRadius: 14, objectFit: "cover", flexShrink: 0 }}
                        />
                      )}
                    </div>

                    <div style={{ borderTop: `1px solid ${COLORS.ink200}`, margin: "16px 0" }} />

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: COLORS.ink900 }}>Attendance &amp; Work</div>
                      {canUndo && (
                        <button
                          onClick={handleUndoStep}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            background: "none",
                            border: `1px solid ${COLORS.ink200}`,
                            borderRadius: 8,
                            padding: "4px 10px",
                            fontSize: 11,
                            fontWeight: 600,
                            color: COLORS.ink700,
                            cursor: "pointer",
                          }}
                        >
                          <Undo2 size={12} />
                          Undo
                        </button>
                      )}
                    </div>

                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, gap: 4 }}>
                      {[
                        { n: 1, label: "Start Attendance", state: selectedIssue.status !== "open" ? "done" : "current" },
                        { n: 2, label: "In Progress", state: isSelectedIssueDone ? "done" : selectedIssue.status === "in_progress" ? "current" : "todo" },
                        { n: 3, label: "Upload Photo", state: selectedIssueResolution?.resolution_image_url ? "done" : completionStep === "review" ? "current" : "todo" },
                        { n: 4, label: "Finish Issue", state: isSelectedIssueDone ? "done" : completionPreviewUrl ? "current" : "todo" },
                      ].map((s, idx, arr) => (
                        <React.Fragment key={s.n}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: 1 }}>
                            <div
                              style={{
                                width: 26,
                                height: 26,
                                borderRadius: "50%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 12,
                                fontWeight: 700,
                                flexShrink: 0,
                                color: s.state === "todo" ? COLORS.ink500 : "#FFFFFF",
                                backgroundColor: s.state === "done" ? COLORS.green600 : s.state === "current" ? COLORS.blue500 : COLORS.ink200,
                              }}
                            >
                              {s.n}
                            </div>
                            <div style={{ fontSize: 10, color: COLORS.ink500, textAlign: "center", lineHeight: 1.2 }}>
                              {s.label}
                            </div>
                          </div>
                          {idx < arr.length - 1 && (
                            <div
                              style={{ flex: 1, minWidth: 8, height: 2, backgroundColor: s.state === "done" ? COLORS.green600 : COLORS.ink200, marginTop: 12 }}
                            />
                          )}
                        </React.Fragment>
                      ))}
                    </div>

                    {selectedIssue.status === "open" && (
                      <div style={{ backgroundColor: COLORS.green100, border: "1px solid #BBF7D0", borderRadius: 14, padding: 14 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, color: COLORS.ink900 }}>Start Attendance</div>
                        <div style={{ fontSize: 12, color: COLORS.ink700, marginBottom: 12 }}>
                          Click the button below when you arrive on site.
                        </div>
                        <button
                          onClick={startAttendance}
                          style={{ backgroundColor: COLORS.green600, color: "#FFFFFF", border: "none", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", width: "100%" }}
                        >
                          START ATTENDANCE
                        </button>
                      </div>
                    )}

                    {selectedIssue.status === "in_progress" && completionStep === "idle" && (
                      <button
                        onClick={() => setCompletionStep("capture")}
                        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", backgroundColor: COLORS.blue500, color: "#FFFFFF", border: "none", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                      >
                        <CheckCircle2 size={16} />
                        Assignment Completed
                      </button>
                    )}

                    {selectedIssue.status === "in_progress" && completionStep === "capture" && (
                      <div style={{ backgroundColor: COLORS.blue100, border: "1px solid #BFDBFE", borderRadius: 14, padding: 14 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, color: COLORS.ink900 }}>Upload a photo</div>
                        <div style={{ fontSize: 12, color: COLORS.ink700, marginBottom: 12 }}>
                          Take a photo on site, or choose one from your gallery.
                        </div>
                        <div style={{ display: "flex", gap: 10 }}>
                          <label
                            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: COLORS.blue500, color: "#FFFFFF", border: "none", borderRadius: 10, padding: "10px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                          >
                            <Camera size={14} />
                            Take Photo
                            <input type="file" accept="image/*" capture="environment" onChange={handleCompletionFileChange} style={{ display: "none" }} />
                          </label>
                          <label
                            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: COLORS.surface, color: COLORS.blue500, border: `1px solid ${COLORS.blue500}`, borderRadius: 10, padding: "10px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                          >
                            <ImageIcon size={14} />
                            Gallery
                            <input type="file" accept="image/*" onChange={handleCompletionFileChange} style={{ display: "none" }} />
                          </label>
                        </div>
                        <button
                          onClick={() => setCompletionStep("idle")}
                          style={{ marginTop: 10, width: "100%", background: "none", border: "none", color: COLORS.ink500, fontSize: 12, cursor: "pointer" }}
                        >
                          Cancel
                        </button>
                      </div>
                    )}

                    {selectedIssue.status === "in_progress" && completionStep === "review" && (
                      <div style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.ink200}`, borderRadius: 14, padding: 14 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: COLORS.ink900 }}>Photo preview</div>
                        {completionPreviewUrl && (
                          <img
                            src={completionPreviewUrl}
                            alt="Completion preview"
                            style={{ width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 12, marginBottom: 10 }}
                          />
                        )}
                        <button
                          onClick={() => {
                            setCompletionFile(null);
                            setCompletionPreviewUrl((current) => {
                              if (current) URL.revokeObjectURL(current);
                              return null;
                            });
                            setCompletionStep("capture");
                          }}
                          style={{ marginBottom: 14, background: "none", border: "none", color: COLORS.blue500, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }}
                        >
                          Choose a different photo
                        </button>

                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                          <MessageSquare size={16} color={COLORS.green700} />
                          <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.ink900 }}>Add a note</span>
                        </div>
                        <textarea
                          value={completionNote}
                          onChange={(event) => setCompletionNote(event.target.value)}
                          placeholder="How did the job go? Note any follow-up needed..."
                          rows={3}
                          style={{ width: "100%", border: `1px solid ${COLORS.ink200}`, borderRadius: 12, padding: "10px 12px", fontSize: 13, color: COLORS.ink900, resize: "vertical", fontFamily: "inherit", marginBottom: 10, boxSizing: "border-box" }}
                        />

                        {completionError && (
                          <div style={{ color: COLORS.red500, fontSize: 12, marginBottom: 10 }}>{completionError}</div>
                        )}

                        <button
                          onClick={handleSubmitCompletion}
                          disabled={submittingCompletion}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 8,
                            width: "100%",
                            backgroundColor: submittingCompletion ? COLORS.ink200 : COLORS.green600,
                            color: submittingCompletion ? COLORS.ink500 : "#FFFFFF",
                            border: "none",
                            borderRadius: 10,
                            padding: "10px 16px",
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: submittingCompletion ? "not-allowed" : "pointer",
                          }}
                        >
                          <Send size={14} />
                          {submittingCompletion ? "Sending…" : "Submit Proof of Resolution"}
                        </button>
                      </div>
                    )}

                    {isSelectedIssueDone && (
                      <div style={{ backgroundColor: COLORS.green100, border: "1px solid #BBF7D0", borderRadius: 14, padding: 14 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                          <CheckCircle2 size={16} color={COLORS.green700} />
                          <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.ink900 }}>
                            Completed{selectedIssueResolution?.attended_at ? ` \u2013 ${dateFormatter.format(new Date(selectedIssueResolution.attended_at))}` : ""}
                          </span>
                        </div>
                        {selectedIssueResolution?.resolution_image_url && (
                          <img
                            src={selectedIssueResolution.resolution_image_url}
                            alt="Resolution"
                            style={{ width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 12, marginBottom: 10 }}
                          />
                        )}
                        {selectedIssueComments.length > 0 && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            {selectedIssueComments.map((comment) => (
                              <div key={comment.id} style={{ display: "flex", gap: 10 }}>
                                <div
                                  style={{ width: 28, height: 28, borderRadius: "50%", backgroundColor: COLORS.surface, color: COLORS.green700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                                >
                                  <User size={14} />
                                </div>
                                <div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, flexWrap: "wrap" }}>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink900 }}>{comment.author}</span>
                                    <span style={{ fontSize: 11, color: COLORS.ink500 }}>
                                      {dateFormatter.format(comment.timestamp)}
                                    </span>
                                  </div>
                                  <p style={{ margin: 0, fontSize: 12.5, color: COLORS.ink700, lineHeight: 1.5 }}>{comment.text}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </React.Fragment>
                )}
              </div>

              <div style={{ backgroundColor: COLORS.surface, borderRadius: 20, border: `1px solid ${COLORS.ink200}`, boxShadow: cardShadow, padding: 20, overflow: "hidden" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: COLORS.ink900 }}>My Work History / Reports</div>
                  <span style={{ fontSize: 13, color: COLORS.green700, cursor: "pointer", fontWeight: 600 }}>View all</span>
                </div>

                <div style={{ overflowX: "auto", width: "100%" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 420 }}>
                    <thead>
                      <tr>
                        {["Issue", "Type", "Location", "Check-in", "Check-out", "Status", ""].map((h) => (
                          <th key={h} style={{ textAlign: "left", padding: "6px 4px", color: COLORS.ink500, fontWeight: 600, borderBottom: `1px solid ${COLORS.ink200}` }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {workHistory.length === 0 && (
                        <tr>
                          <td colSpan={7} style={{ padding: "10px 4px", color: COLORS.ink500, fontSize: 12 }}>
                            No work history yet.
                          </td>
                        </tr>
                      )}
                      {workHistory.map((row) => {
                        const sc = statusColors(row.status);
                        return (
                          <tr key={row.id}>
                            <td style={{ padding: "8px 4px", borderBottom: `1px solid ${COLORS.ink100}`, fontWeight: 600, color: COLORS.ink900 }}>{shortId(row.id)}</td>
                            <td style={{ padding: "8px 4px", borderBottom: `1px solid ${COLORS.ink100}` }}>
                              <span style={{ backgroundColor: COLORS.ink100, color: COLORS.ink700, padding: "2px 8px", borderRadius: 999, fontSize: 11 }}>{row.type}</span>
                            </td>
                            <td style={{ padding: "8px 4px", borderBottom: `1px solid ${COLORS.ink100}`, color: COLORS.ink700 }}>{row.location}</td>
                            <td style={{ padding: "8px 4px", borderBottom: `1px solid ${COLORS.ink100}`, color: COLORS.ink700 }}>{row.checkIn}</td>
                            <td style={{ padding: "8px 4px", borderBottom: `1px solid ${COLORS.ink100}`, color: COLORS.ink700 }}>{row.checkOut}</td>
                            <td style={{ padding: "8px 4px", borderBottom: `1px solid ${COLORS.ink100}` }}>
                              <span style={{ backgroundColor: sc.bg, color: sc.fg, padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600 }}>{row.status}</span>
                            </td>
                            <td style={{ padding: "8px 4px", borderBottom: `1px solid ${COLORS.ink100}` }}>
                              <button
                                onClick={() => {
                                  const report = reports.find((r) => r.id === row.id);
                                  if (report) setViewDetailsIssue(report);
                                }}
                                title="View Detailed Report"
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4,
                                  background: "none",
                                  border: `1px solid ${COLORS.ink200}`,
                                  borderRadius: 8,
                                  padding: "4px 8px",
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: COLORS.green700,
                                  cursor: "pointer",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                <FileText size={12} />
                                View
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>

        <Footer />
      </div>

      {viewDetailsIssue && (
        <div
          onClick={() => setViewDetailsIssue(null)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(17, 24, 39, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: COLORS.surface,
              borderRadius: 20,
              padding: 24,
              maxWidth: 480,
              width: "100%",
              maxHeight: "85vh",
              overflowY: "auto",
              boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 18, color: COLORS.ink900 }}>
                  {shortId(viewDetailsIssue.id)} {"\u2013"} {viewDetailsIssue.categories?.category_name || "General"}
                </div>
                <span
                  style={{
                    display: "inline-block",
                    marginTop: 6,
                    backgroundColor: statusColors(statusToDisplay(viewDetailsIssue.status)).bg,
                    color: statusColors(statusToDisplay(viewDetailsIssue.status)).fg,
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "3px 8px",
                    borderRadius: 999,
                  }}
                >
                  {statusToDisplay(viewDetailsIssue.status)}
                </span>
              </div>
              <button
                onClick={() => setViewDetailsIssue(null)}
                style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.ink500, padding: 4 }}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            {(viewDetailsIssue.report_images?.[0]?.image_url || viewDetailsIssue.proof_image_url) && (
              <img
                src={viewDetailsIssue.report_images?.[0]?.image_url || viewDetailsIssue.proof_image_url}
                alt="Report"
                style={{ width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 12, marginBottom: 16 }}
              />
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13, color: COLORS.ink700 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <MapPin size={14} color={COLORS.ink500} />
                {viewDetailsIssue.location}
                {viewDetailsIssue.latitude != null && viewDetailsIssue.longitude != null && (
                  <span style={{ color: COLORS.ink500, fontSize: 11 }}>
                    ({Number(viewDetailsIssue.latitude).toFixed(4)}, {Number(viewDetailsIssue.longitude).toFixed(4)})
                  </span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Calendar size={14} color={COLORS.ink500} />
                Reported: {viewDetailsIssue.created_at ? dateFormatter.format(new Date(viewDetailsIssue.created_at)) : "\u2013"}
              </div>
              {viewDetailsIssue.started_at && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Calendar size={14} color={COLORS.ink500} />
                  Started: {dateFormatter.format(new Date(viewDetailsIssue.started_at))}
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <TriangleAlert size={14} color={priorityColor(viewDetailsIssue.severity)} />
                Priority: <span style={{ color: priorityColor(viewDetailsIssue.severity), fontWeight: 600 }}>{viewDetailsIssue.severity}</span>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <FileText size={14} color={COLORS.ink500} style={{ marginTop: 2, flexShrink: 0 }} />
                {viewDetailsIssue.description || viewDetailsIssue.title || "No description provided."}
              </div>
            </div>

            {resolutions[viewDetailsIssue.id] && (
              <React.Fragment>
                <div style={{ borderTop: `1px solid ${COLORS.ink200}`, margin: "16px 0" }} />
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: COLORS.ink900 }}>Resolution</div>
                {resolutions[viewDetailsIssue.id].resolution_image_url && (
                  <img
                    src={resolutions[viewDetailsIssue.id].resolution_image_url}
                    alt="Resolution"
                    style={{ width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 12, marginBottom: 10 }}
                  />
                )}
                {resolutions[viewDetailsIssue.id].attendant_name && (
                  <div style={{ fontSize: 12, color: COLORS.ink700, marginBottom: 4 }}>
                    Attended by: {resolutions[viewDetailsIssue.id].attendant_name}
                  </div>
                )}
                {resolutions[viewDetailsIssue.id].attended_at && (
                  <div style={{ fontSize: 12, color: COLORS.ink700, marginBottom: 4 }}>
                    Completed: {dateFormatter.format(new Date(resolutions[viewDetailsIssue.id].attended_at))}
                  </div>
                )}
                {resolutions[viewDetailsIssue.id].resolution_note && (
                  <p style={{ fontSize: 12.5, color: COLORS.ink700, lineHeight: 1.5 }}>
                    {resolutions[viewDetailsIssue.id].resolution_note}
                  </p>
                )}
              </React.Fragment>
            )}
          </div>
        </div>
      )}
    </Sidebar>
  );
}