package report

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"

	"github.com/zbum/manty-blast-mail/internal/auth"
)

// Handler provides HTTP handlers for report endpoints.
type Handler struct {
	service *Service
}

// NewHandler creates a new report handler.
func NewHandler(db *gorm.DB) *Handler {
	repo := NewRepository(db)
	svc := NewService(repo)
	return &Handler{service: svc}
}

// Logs handles GET /campaigns/{id}/logs - paginated send logs for a campaign.
func (h *Handler) Logs(w http.ResponseWriter, r *http.Request) {
	campaignID, err := parseIDParam(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("page_size"))

	logs, total, err := h.service.GetLogs(campaignID, page, pageSize)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load logs")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"logs":  logs,
		"total": total,
		"page":  page,
	})
}

// Export handles GET /campaigns/{id}/report/export - CSV export of send results.
func (h *Handler) Export(w http.ResponseWriter, r *http.Request) {
	campaignID, err := parseIDParam(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Buffer CSV to memory first to avoid sending headers before verifying success
	var buf bytes.Buffer
	if err := h.service.ExportCSV(campaignID, &buf); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to export report")
		return
	}

	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=campaign_%d_report.csv", campaignID))
	w.Write(buf.Bytes())
}

// Dashboard handles GET /dashboard - aggregate stats.
func (h *Handler) Dashboard(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(auth.UserIDKey).(uint64)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	stats, err := h.service.GetDashboardStats(userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load dashboard stats")
		return
	}

	writeJSON(w, http.StatusOK, stats)
}

// --- Helpers ---

func parseIDParam(r *http.Request) (uint64, error) {
	idStr := chi.URLParam(r, "id")
	if idStr == "" {
		return 0, fmt.Errorf("missing campaign id")
	}
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid campaign id: %s", idStr)
	}
	return id, nil
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}
