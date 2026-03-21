package attachment

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"

	"github.com/zbum/manty-blast-mail/internal/auth"
	"github.com/zbum/manty-blast-mail/internal/campaign"
	"github.com/zbum/manty-blast-mail/internal/config"
)

type Handler struct {
	repo         *Repository
	campaignRepo *campaign.Repository
	limits       config.LimitsConfig
	storagePath  string
}

func NewHandler(db *gorm.DB, limits config.LimitsConfig, storagePath string) *Handler {
	return &Handler{
		repo:         NewRepository(db),
		campaignRepo: campaign.NewRepository(db),
		limits:       limits,
		storagePath:  storagePath,
	}
}

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

	c, err := h.campaignRepo.FindByID(campaignID)
	if err != nil {
		http.Error(w, `{"error":"campaign not found"}`, http.StatusNotFound)
		return
	}
	role, _ := r.Context().Value(auth.UserRoleKey).(string)
	if role != "admin" && c.UserID != userID {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	if err := r.ParseMultipartForm(h.limits.MaxAttachmentSize + (1 << 20)); err != nil {
		http.Error(w, `{"error":"failed to parse form"}`, http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, `{"error":"file is required"}`, http.StatusBadRequest)
		return
	}
	defer file.Close()

	if header.Size > h.limits.MaxAttachmentSize {
		writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("file exceeds maximum size of %d bytes", h.limits.MaxAttachmentSize))
		return
	}

	// Check total size doesn't exceed max MIME size
	totalSize, _ := h.repo.TotalSizeByCampaign(campaignID)
	if totalSize+header.Size > h.limits.MaxMIMESize {
		writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("total attachments would exceed maximum MIME size of %d bytes", h.limits.MaxMIMESize))
		return
	}

	// Create storage directory
	dir := filepath.Join(h.storagePath, strconv.FormatUint(campaignID, 10))
	if err := os.MkdirAll(dir, 0755); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to create storage directory")
		return
	}

	// Sanitize filename
	filename := filepath.Base(header.Filename)
	storagePath := filepath.Join(dir, filename)

	// Handle duplicate filenames
	if _, err := os.Stat(storagePath); err == nil {
		ext := filepath.Ext(filename)
		base := strings.TrimSuffix(filename, ext)
		for i := 1; ; i++ {
			filename = fmt.Sprintf("%s_%d%s", base, i, ext)
			storagePath = filepath.Join(dir, filename)
			if _, err := os.Stat(storagePath); os.IsNotExist(err) {
				break
			}
		}
	}

	// Save file to disk
	dst, err := os.Create(storagePath)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to save file")
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		os.Remove(storagePath)
		writeJSONError(w, http.StatusInternalServerError, "failed to write file")
		return
	}

	// Detect content type
	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	attachment := &Attachment{
		CampaignID:  campaignID,
		Filename:    filename,
		ContentType: contentType,
		Size:        header.Size,
		StoragePath: storagePath,
	}

	if err := h.repo.Create(attachment); err != nil {
		os.Remove(storagePath)
		writeJSONError(w, http.StatusInternalServerError, "failed to save attachment record")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(attachment)
}

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

	c, err := h.campaignRepo.FindByID(campaignID)
	if err != nil {
		http.Error(w, `{"error":"campaign not found"}`, http.StatusNotFound)
		return
	}
	role, _ := r.Context().Value(auth.UserRoleKey).(string)
	if role != "admin" && c.UserID != userID {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	attachments, err := h.repo.FindByCampaignID(campaignID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to fetch attachments")
		return
	}

	if attachments == nil {
		attachments = []Attachment{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(attachments)
}

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

	attachmentID, err := strconv.ParseUint(chi.URLParam(r, "attachmentId"), 10, 64)
	if err != nil {
		http.Error(w, `{"error":"invalid attachment id"}`, http.StatusBadRequest)
		return
	}

	c, err := h.campaignRepo.FindByID(campaignID)
	if err != nil {
		http.Error(w, `{"error":"campaign not found"}`, http.StatusNotFound)
		return
	}
	role, _ := r.Context().Value(auth.UserRoleKey).(string)
	if role != "admin" && c.UserID != userID {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	a, err := h.repo.FindByID(attachmentID)
	if err != nil {
		http.Error(w, `{"error":"attachment not found"}`, http.StatusNotFound)
		return
	}

	if a.CampaignID != campaignID {
		http.Error(w, `{"error":"attachment does not belong to this campaign"}`, http.StatusForbidden)
		return
	}

	// Remove file from disk
	os.Remove(a.StoragePath)

	if err := h.repo.Delete(attachmentID); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to delete attachment")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"message":"attachment deleted"}`))
}

func writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
