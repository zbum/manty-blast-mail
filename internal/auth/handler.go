package auth

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type User struct {
	ID       uint64 `json:"id" gorm:"primaryKey"`
	Username string `json:"username" gorm:"uniqueIndex;size:255"`
	Password string `json:"-" gorm:"size:255"`
	Role     string `json:"role" gorm:"size:20;default:'user'"`
}

type Handler struct {
	db           *gorm.DB
	sessionStore *SessionStore
}

func NewHandler(db *gorm.DB, sessionStore *SessionStore) *Handler {
	return &Handler{db: db, sessionStore: sessionStore}
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type meResponse struct {
	ID       uint64 `json:"id"`
	Username string `json:"username"`
	Role     string `json:"role"`
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Username == "" || req.Password == "" {
		http.Error(w, `{"error":"username and password are required"}`, http.StatusBadRequest)
		return
	}

	var user User
	if err := h.db.Where("username = ?", req.Username).First(&user).Error; err != nil {
		http.Error(w, `{"error":"invalid credentials"}`, http.StatusUnauthorized)
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		http.Error(w, `{"error":"invalid credentials"}`, http.StatusUnauthorized)
		return
	}

	session, err := h.sessionStore.Get(r)
	if err != nil {
		http.Error(w, `{"error":"session error"}`, http.StatusInternalServerError)
		return
	}

	session.Values["user_id"] = user.ID
	if err := session.Save(r, w); err != nil {
		http.Error(w, `{"error":"failed to save session"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(meResponse{
		ID:       user.ID,
		Username: user.Username,
		Role:     user.Role,
	})
}

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	session, err := h.sessionStore.Get(r)
	if err != nil {
		http.Error(w, `{"error":"session error"}`, http.StatusInternalServerError)
		return
	}

	session.Values["user_id"] = nil
	session.Options.MaxAge = -1
	if err := session.Save(r, w); err != nil {
		http.Error(w, `{"error":"failed to save session"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"message":"logged out"}`))
}

type createUserRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (h *Handler) requireAdmin(r *http.Request) (*User, error) {
	userID, ok := r.Context().Value(UserIDKey).(uint64)
	if !ok {
		return nil, fmt.Errorf("unauthorized")
	}
	var user User
	if err := h.db.First(&user, userID).Error; err != nil {
		return nil, fmt.Errorf("user not found")
	}
	if user.Role != "admin" {
		return nil, fmt.Errorf("forbidden")
	}
	return &user, nil
}

func (h *Handler) CreateUser(w http.ResponseWriter, r *http.Request) {
	if _, err := h.requireAdmin(r); err != nil {
		http.Error(w, `{"error":"admin access required"}`, http.StatusForbidden)
		return
	}

	var req createUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Username == "" || req.Password == "" {
		http.Error(w, `{"error":"username and password are required"}`, http.StatusBadRequest)
		return
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, `{"error":"failed to hash password"}`, http.StatusInternalServerError)
		return
	}

	user := User{Username: req.Username, Password: string(hashed), Role: "user"}
	if err := h.db.Create(&user).Error; err != nil {
		http.Error(w, `{"error":"username already exists"}`, http.StatusConflict)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(meResponse{
		ID:       user.ID,
		Username: user.Username,
		Role:     user.Role,
	})
}

func (h *Handler) ListUsers(w http.ResponseWriter, r *http.Request) {
	if _, err := h.requireAdmin(r); err != nil {
		http.Error(w, `{"error":"admin access required"}`, http.StatusForbidden)
		return
	}

	var users []User
	h.db.Order("id ASC").Find(&users)

	type userItem struct {
		ID       uint64 `json:"id"`
		Username string `json:"username"`
		Role     string `json:"role"`
	}
	result := make([]userItem, len(users))
	for i, u := range users {
		result[i] = userItem{ID: u.ID, Username: u.Username, Role: u.Role}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (h *Handler) DeleteUser(w http.ResponseWriter, r *http.Request) {
	admin, err := h.requireAdmin(r)
	if err != nil {
		http.Error(w, `{"error":"admin access required"}`, http.StatusForbidden)
		return
	}

	idStr := chi.URLParam(r, "userId")
	var userID uint64
	if _, err := fmt.Sscanf(idStr, "%d", &userID); err != nil {
		http.Error(w, `{"error":"invalid user id"}`, http.StatusBadRequest)
		return
	}

	if userID == admin.ID {
		http.Error(w, `{"error":"cannot delete yourself"}`, http.StatusBadRequest)
		return
	}

	if err := h.db.Delete(&User{}, userID).Error; err != nil {
		http.Error(w, `{"error":"failed to delete user"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"message":"user deleted"}`))
}

type updateRoleRequest struct {
	Role string `json:"role"`
}

func (h *Handler) UpdateRole(w http.ResponseWriter, r *http.Request) {
	admin, err := h.requireAdmin(r)
	if err != nil {
		http.Error(w, `{"error":"admin access required"}`, http.StatusForbidden)
		return
	}

	idStr := chi.URLParam(r, "userId")
	var userID uint64
	if _, err := fmt.Sscanf(idStr, "%d", &userID); err != nil {
		http.Error(w, `{"error":"invalid user id"}`, http.StatusBadRequest)
		return
	}

	if userID == admin.ID {
		http.Error(w, `{"error":"cannot change your own role"}`, http.StatusBadRequest)
		return
	}

	var req updateRoleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Role != "admin" && req.Role != "user" {
		http.Error(w, `{"error":"role must be 'admin' or 'user'"}`, http.StatusBadRequest)
		return
	}

	var user User
	if err := h.db.First(&user, userID).Error; err != nil {
		http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
		return
	}

	h.db.Model(&user).Update("role", req.Role)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(meResponse{
		ID:       user.ID,
		Username: user.Username,
		Role:     req.Role,
	})
}

type changePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

func (h *Handler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(UserIDKey).(uint64)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req changePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.CurrentPassword == "" || req.NewPassword == "" {
		http.Error(w, `{"error":"current_password and new_password are required"}`, http.StatusBadRequest)
		return
	}

	var user User
	if err := h.db.First(&user, userID).Error; err != nil {
		http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.CurrentPassword)); err != nil {
		http.Error(w, `{"error":"current password is incorrect"}`, http.StatusBadRequest)
		return
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, `{"error":"failed to hash password"}`, http.StatusInternalServerError)
		return
	}

	h.db.Model(&user).Update("password", string(hashed))

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"message":"password changed"}`))
}

func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(UserIDKey).(uint64)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var user User
	if err := h.db.First(&user, userID).Error; err != nil {
		http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(meResponse{
		ID:       user.ID,
		Username: user.Username,
		Role:     user.Role,
	})
}
