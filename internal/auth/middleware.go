package auth

import (
	"context"
	"net/http"
)

type ContextKey string

const UserIDKey ContextKey = "user_id"

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
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
