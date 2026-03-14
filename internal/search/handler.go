package search

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/zbum/manty-blast-mail/internal/ctxkey"
)

type Handler struct {
	indexer *Indexer
}

func NewHandler(indexer *Indexer) *Handler {
	return &Handler{indexer: indexer}
}

type searchResult struct {
	Type string     `json:"type"`
	ID   uint64     `json:"id"`
	Name string     `json:"name"`
	Desc string     `json:"description"`
	URL  string     `json:"url"`
	Time *time.Time `json:"time,omitempty"`
}

type searchResponse struct {
	Query   string         `json:"query"`
	Results []searchResult `json:"results"`
	Total   int            `json:"total"`
}

func (h *Handler) Search(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" || len(q) < 2 {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(searchResponse{Query: q, Results: []searchResult{}, Total: 0})
		return
	}

	userID, _ := r.Context().Value(ctxkey.UserIDKey).(uint64)
	role, _ := r.Context().Value(ctxkey.UserRoleKey).(string)

	results := h.indexer.Search(q, userID, role, 50)
	if results == nil {
		results = []searchResult{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(searchResponse{
		Query:   q,
		Results: results,
		Total:   len(results),
	})
}
