package auth

import (
	"context"
	"net/http"

	"github.com/zbum/manty-blast-mail/internal/ctxkey"
)

// Re-export context keys for backward compatibility with existing code.
const UserIDKey = ctxkey.UserIDKey
const UserRoleKey = ctxkey.UserRoleKey

type Middleware struct {
	sessionStore *SessionStore
}

func NewMiddleware(sessionStore *SessionStore) *Middleware {
	return &Middleware{sessionStore: sessionStore}
}

func (m *Middleware) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		session, err := m.sessionStore.Get(r)
		if err != nil {
			http.Error(w, `{"error":"session error"}`, http.StatusInternalServerError)
			return
		}

		userID, ok := session.Values["user_id"]
		if !ok || userID == nil {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}

		uid, ok := userID.(uint64)
		if !ok {
			http.Error(w, `{"error":"invalid session"}`, http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), UserIDKey, uid)
		if role, ok := session.Values["user_role"].(string); ok {
			ctx = context.WithValue(ctx, UserRoleKey, role)
		}
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (m *Middleware) RequireApproved(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		role, _ := r.Context().Value(UserRoleKey).(string)
		if role == "pending" {
			w.Header().Set("Content-Type", "application/json")
			http.Error(w, `{"error":"account pending approval"}`, http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}
