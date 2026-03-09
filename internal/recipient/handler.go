package recipient

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/mail"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"

	"github.com/zbum/manty-blast-mail/internal/auth"
	"github.com/zbum/manty-blast-mail/internal/campaign"
)

func isValidEmail(email string) bool {
	_, err := mail.ParseAddress(email)
	return err == nil
}

type Handler struct {
	repo         *Repository
	campaignRepo *campaign.Repository
}

func NewHandler(db *gorm.DB) *Handler {
	return &Handler{
		repo:         NewRepository(db),
		campaignRepo: campaign.NewRepository(db),
	}
}

// Upload handles multipart file upload of CSV or Excel files containing recipients.
func (h *Handler) Upload(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(auth.UserIDKey).(uint64)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	campaignID, err := strconv.ParseUint(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, `{"error":"invalid campaign id"}`, http.StatusBadRequest)
		return
	}

	// Verify campaign exists and belongs to user
	c, err := h.campaignRepo.FindByID(campaignID)
	if err != nil {
		http.Error(w, `{"error":"campaign not found"}`, http.StatusNotFound)
		return
	}
	if c.UserID != userID {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	// Parse multipart form (max 32MB)
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		http.Error(w, `{"error":"failed to parse form"}`, http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, `{"error":"file is required"}`, http.StatusBadRequest)
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))

	var recipients []Recipient
	switch ext {
	case ".csv":
		recipients, err = ParseCSV(file)
	case ".xlsx", ".xls":
		recipients, err = ParseExcel(file)
	default:
		http.Error(w, `{"error":"unsupported file format, use CSV or Excel (.xlsx)"}`, http.StatusBadRequest)
		return
	}

	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"failed to parse file: %s"}`, err.Error()), http.StatusBadRequest)
		return
	}

	if len(recipients) == 0 {
		http.Error(w, `{"error":"no valid recipients found in file"}`, http.StatusBadRequest)
		return
	}

	// Set campaign ID for all recipients
	for i := range recipients {
		recipients[i].CampaignID = campaignID
	}

	if err := h.repo.BatchCreate(recipients); err != nil {
		http.Error(w, `{"error":"failed to save recipients"}`, http.StatusInternalServerError)
		return
	}

	// Update campaign total count
	c.TotalCount += len(recipients)
	if err := h.campaignRepo.Update(c); err != nil {
		http.Error(w, `{"error":"failed to update campaign count"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message": fmt.Sprintf("%d recipients uploaded", len(recipients)),
		"count":   len(recipients),
	})
}

type manualRecipient struct {
	Email     string  `json:"email"`
	Name      string  `json:"name"`
	Variables JSONMap  `json:"variables"`
}

// Manual handles adding recipients via JSON array input.
func (h *Handler) Manual(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(auth.UserIDKey).(uint64)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	campaignID, err := strconv.ParseUint(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, `{"error":"invalid campaign id"}`, http.StatusBadRequest)
		return
	}

	// Verify campaign exists and belongs to user
	c, err := h.campaignRepo.FindByID(campaignID)
	if err != nil {
		http.Error(w, `{"error":"campaign not found"}`, http.StatusNotFound)
		return
	}
	if c.UserID != userID {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	var body struct {
		Recipients []manualRecipient `json:"recipients"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	input := body.Recipients

	if len(input) == 0 {
		http.Error(w, `{"error":"at least one recipient is required"}`, http.StatusBadRequest)
		return
	}

	recipients := make([]Recipient, 0, len(input))
	for _, mr := range input {
		if mr.Email == "" || !isValidEmail(mr.Email) {
			continue
		}
		recipients = append(recipients, Recipient{
			CampaignID: campaignID,
			Email:      mr.Email,
			Name:       mr.Name,
			Variables:  mr.Variables,
			Status:     "pending",
		})
	}

	if len(recipients) == 0 {
		http.Error(w, `{"error":"no valid recipients provided"}`, http.StatusBadRequest)
		return
	}

	if err := h.repo.BatchCreate(recipients); err != nil {
		http.Error(w, `{"error":"failed to save recipients"}`, http.StatusInternalServerError)
		return
	}

	// Update campaign total count
	c.TotalCount += len(recipients)
	if err := h.campaignRepo.Update(c); err != nil {
		http.Error(w, `{"error":"failed to update campaign count"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message": fmt.Sprintf("%d recipients added", len(recipients)),
		"count":   len(recipients),
	})
}

type recipientListResponse struct {
	Data       []Recipient `json:"data"`
	Total      int64       `json:"total"`
	Page       int         `json:"page"`
	PageSize   int         `json:"page_size"`
	TotalPages int         `json:"total_pages"`
}

// List returns a paginated list of recipients for a campaign.
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(auth.UserIDKey).(uint64)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	campaignID, err := strconv.ParseUint(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, `{"error":"invalid campaign id"}`, http.StatusBadRequest)
		return
	}

	// Verify campaign belongs to user
	c, err := h.campaignRepo.FindByID(campaignID)
	if err != nil {
		http.Error(w, `{"error":"campaign not found"}`, http.StatusNotFound)
		return
	}
	if c.UserID != userID {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("pageSize"))
	search := r.URL.Query().Get("search")
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	recipients, total, err := h.repo.FindByCampaignID(campaignID, page, pageSize, search)
	if err != nil {
		http.Error(w, `{"error":"failed to fetch recipients"}`, http.StatusInternalServerError)
		return
	}

	totalPages := int(total) / pageSize
	if int(total)%pageSize != 0 {
		totalPages++
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(recipientListResponse{
		Data:       recipients,
		Total:      total,
		Page:       page,
		PageSize:   pageSize,
		TotalPages: totalPages,
	})
}

// Delete removes a single recipient from a campaign.
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(auth.UserIDKey).(uint64)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	campaignID, err := strconv.ParseUint(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, `{"error":"invalid campaign id"}`, http.StatusBadRequest)
		return
	}

	recipientID, err := strconv.ParseUint(chi.URLParam(r, "recipientId"), 10, 64)
	if err != nil {
		http.Error(w, `{"error":"invalid recipient id"}`, http.StatusBadRequest)
		return
	}

	// Verify campaign belongs to user
	c, err := h.campaignRepo.FindByID(campaignID)
	if err != nil {
		http.Error(w, `{"error":"campaign not found"}`, http.StatusNotFound)
		return
	}
	if c.UserID != userID {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	if err := h.repo.DeleteByID(recipientID, campaignID); err != nil {
		http.Error(w, `{"error":"failed to delete recipient"}`, http.StatusInternalServerError)
		return
	}

	// Decrease campaign total count
	if c.TotalCount > 0 {
		c.TotalCount--
	}
	if err := h.campaignRepo.Update(c); err != nil {
		http.Error(w, `{"error":"failed to update campaign count"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"message":"recipient deleted"}`))
}

// DeleteAll removes all recipients for a campaign and resets the total count.
func (h *Handler) DeleteAll(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(auth.UserIDKey).(uint64)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	campaignID, err := strconv.ParseUint(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, `{"error":"invalid campaign id"}`, http.StatusBadRequest)
		return
	}

	// Verify campaign belongs to user
	c, err := h.campaignRepo.FindByID(campaignID)
	if err != nil {
		http.Error(w, `{"error":"campaign not found"}`, http.StatusNotFound)
		return
	}
	if c.UserID != userID {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	if err := h.repo.DeleteByCampaignID(campaignID); err != nil {
		http.Error(w, `{"error":"failed to delete recipients"}`, http.StatusInternalServerError)
		return
	}

	// Reset campaign total count
	c.TotalCount = 0
	c.SentCount = 0
	c.FailedCount = 0
	if err := h.campaignRepo.Update(c); err != nil {
		http.Error(w, `{"error":"failed to update campaign count"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"message":"all recipients deleted"}`))
}
