package campaign

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"

	"github.com/zbum/manty-blast-mail/internal/auth"
	"github.com/zbum/manty-blast-mail/internal/mailer"
)

type Handler struct {
	repo    *Repository
	service *Service
	mailer  *mailer.Mailer
}

func NewHandler(db *gorm.DB, ml *mailer.Mailer) *Handler {
	repo := NewRepository(db)
	svc := NewService(repo)
	return &Handler{repo: repo, service: svc, mailer: ml}
}

type listResponse struct {
	Data       []CampaignListItem `json:"data"`
	Total      int64              `json:"total"`
	Page       int                `json:"page"`
	PageSize   int                `json:"page_size"`
	TotalPages int                `json:"total_pages"`
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(auth.UserIDKey).(uint64)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	role, _ := r.Context().Value(auth.UserRoleKey).(string)

	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("pageSize"))

	var campaigns []CampaignListItem
	var total int64
	var err error
	if role == "admin" {
		campaigns, total, err = h.service.ListAll(page, pageSize)
	} else {
		campaigns, total, err = h.service.List(userID, page, pageSize)
	}
	if err != nil {
		http.Error(w, `{"error":"failed to fetch campaigns"}`, http.StatusInternalServerError)
		return
	}

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	totalPages := int(total) / pageSize
	if int(total)%pageSize != 0 {
		totalPages++
	}

	if campaigns == nil {
		campaigns = []CampaignListItem{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(listResponse{
		Data:       campaigns,
		Total:      total,
		Page:       page,
		PageSize:   pageSize,
		TotalPages: totalPages,
	})
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(auth.UserIDKey).(uint64)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var c Campaign
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	c.UserID = userID
	c.ID = 0 // ensure auto-generation

	if err := h.service.Create(&c); err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(c)
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(auth.UserIDKey).(uint64)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	role, _ := r.Context().Value(auth.UserRoleKey).(string)

	id, err := strconv.ParseUint(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, `{"error":"invalid campaign id"}`, http.StatusBadRequest)
		return
	}

	c, err := h.service.GetByID(id)
	if err != nil {
		http.Error(w, `{"error":"campaign not found"}`, http.StatusNotFound)
		return
	}

	if role != "admin" && c.UserID != userID {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(c)
}

func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(auth.UserIDKey).(uint64)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	role, _ := r.Context().Value(auth.UserRoleKey).(string)

	id, err := strconv.ParseUint(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, `{"error":"invalid campaign id"}`, http.StatusBadRequest)
		return
	}

	existing, err := h.service.GetByID(id)
	if err != nil {
		http.Error(w, `{"error":"campaign not found"}`, http.StatusNotFound)
		return
	}

	if role != "admin" && existing.UserID != userID {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	// Block updates while sending
	if existing.Status == "sending" {
		http.Error(w, `{"error":"cannot update campaign while sending"}`, http.StatusConflict)
		return
	}

	var updates Campaign
	if err := json.NewDecoder(r.Body).Decode(&updates); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	// Apply allowed field updates (status is NOT updatable here)
	if updates.Name != "" {
		existing.Name = updates.Name
	}
	if updates.Subject != "" {
		existing.Subject = updates.Subject
	}
	if updates.BodyType != "" {
		existing.BodyType = updates.BodyType
	}
	if updates.BodyHTML != "" {
		existing.BodyHTML = updates.BodyHTML
	}
	if updates.BodyRawMIME != "" {
		existing.BodyRawMIME = updates.BodyRawMIME
	}
	if updates.FromName != "" {
		existing.FromName = updates.FromName
	}
	if updates.FromEmail != "" {
		existing.FromEmail = updates.FromEmail
	}
	existing.IcsEnabled = updates.IcsEnabled
	if updates.IcsContent != "" {
		existing.IcsContent = updates.IcsContent
	}
	if updates.RateLimit > 0 {
		existing.RateLimit = updates.RateLimit
	}

	if err := h.service.Update(existing); err != nil {
		http.Error(w, `{"error":"failed to update campaign"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(existing)
}

func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(auth.UserIDKey).(uint64)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	role, _ := r.Context().Value(auth.UserRoleKey).(string)

	id, err := strconv.ParseUint(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, `{"error":"invalid campaign id"}`, http.StatusBadRequest)
		return
	}

	existing, err := h.service.GetByID(id)
	if err != nil {
		http.Error(w, `{"error":"campaign not found"}`, http.StatusNotFound)
		return
	}

	if role != "admin" && existing.UserID != userID {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	if err := h.service.Delete(id); err != nil {
		http.Error(w, `{"error":"failed to delete campaign"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"message":"campaign deleted"}`))
}

func (h *Handler) ResetToDraft(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(auth.UserIDKey).(uint64)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	role, _ := r.Context().Value(auth.UserRoleKey).(string)

	id, err := strconv.ParseUint(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, `{"error":"invalid campaign id"}`, http.StatusBadRequest)
		return
	}

	c, err := h.service.GetByID(id)
	if err != nil {
		http.Error(w, `{"error":"campaign not found"}`, http.StatusNotFound)
		return
	}

	if role != "admin" && c.UserID != userID {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	if c.Status != "completed" && c.Status != "cancelled" {
		http.Error(w, `{"error":"only completed or cancelled campaigns can be reset"}`, http.StatusBadRequest)
		return
	}

	// Reset campaign in a transaction
	if err := h.repo.db.Transaction(func(tx *gorm.DB) error {
		// Reset campaign counters and status
		c.Status = "draft"
		c.SentCount = 0
		c.FailedCount = 0
		c.TotalCount = 0
		if err := tx.Save(c).Error; err != nil {
			return err
		}

		// Reset all recipients back to pending
		if err := tx.Table("recipients").
			Where("campaign_id = ?", id).
			Update("status", "pending").Error; err != nil {
			return err
		}

		// Clear send logs
		if err := tx.Table("send_logs").
			Where("campaign_id = ?", id).
			Delete(nil).Error; err != nil {
			return err
		}

		return nil
	}); err != nil {
		http.Error(w, `{"error":"failed to reset campaign"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(c)
}

type previewRequest struct {
	Variables map[string]string `json:"variables"`
}

type previewResponse struct {
	Subject  string `json:"subject"`
	BodyHTML string `json:"body_html"`
}

func (h *Handler) Preview(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(auth.UserIDKey).(uint64)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	role, _ := r.Context().Value(auth.UserRoleKey).(string)

	id, err := strconv.ParseUint(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, `{"error":"invalid campaign id"}`, http.StatusBadRequest)
		return
	}

	c, err := h.service.GetByID(id)
	if err != nil {
		http.Error(w, `{"error":"campaign not found"}`, http.StatusNotFound)
		return
	}

	if role != "admin" && c.UserID != userID {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	var req previewRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		// Use default sample variables if none provided
		req.Variables = map[string]string{
			"name":  "John Doe",
			"email": "john@example.com",
		}
	}

	renderedSubject := RenderTemplate(c.Subject, req.Variables)
	renderedBody := RenderTemplate(c.BodyHTML, req.Variables)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(previewResponse{
		Subject:  renderedSubject,
		BodyHTML: renderedBody,
	})
}

type previewSendRequest struct {
	Email     string            `json:"email"`
	Name      string            `json:"name"`
	Variables map[string]string `json:"variables"`
}

func (h *Handler) PreviewSend(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(auth.UserIDKey).(uint64)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	role, _ := r.Context().Value(auth.UserRoleKey).(string)

	id, err := strconv.ParseUint(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, `{"error":"invalid campaign id"}`, http.StatusBadRequest)
		return
	}

	c, err := h.service.GetByID(id)
	if err != nil {
		http.Error(w, `{"error":"campaign not found"}`, http.StatusNotFound)
		return
	}

	if role != "admin" && c.UserID != userID {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	var req previewSendRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Email == "" {
		http.Error(w, `{"error":"email is required"}`, http.StatusBadRequest)
		return
	}

	// Build the email using the campaign content
	name := req.Name
	if name == "" {
		name = req.Email
	}
	vars := map[string]string{
		"Name":  name,
		"Email": req.Email,
	}
	for k, v := range req.Variables {
		vars[k] = v
	}

	var msg []byte
	if c.BodyType == "raw_mime" {
		msg, err = mailer.BuildRawMIMEMessage(c.BodyRawMIME, vars)
	} else {
		htmlBody, textBody, renderErr := mailer.RenderBody(c.BodyHTML, vars)
		if renderErr != nil {
			writeJSONError(w, http.StatusInternalServerError, "failed to render template: "+renderErr.Error())
			return
		}

		var icsContent string
		if c.IcsEnabled && c.IcsContent != "" {
			icsRendered, icsErr := mailer.RenderTemplate(c.IcsContent, vars)
			if icsErr != nil {
				icsContent = c.IcsContent
			} else {
				icsContent = icsRendered
			}
		}

		msg, err = mailer.BuildHTMLMessage(c.FromEmail, c.FromName, req.Email, "", c.Subject, htmlBody, textBody, icsContent)
	}

	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to build message: "+err.Error())
		return
	}

	if _, err := h.mailer.Send(c.FromEmail, req.Email, msg); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to send: "+err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "test email sent to " + req.Email,
	})
}

func writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
