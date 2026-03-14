package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"io"
	"sync"
)

var (
	instance *Encryptor
	once     sync.Once
)

type Encryptor struct {
	gcm cipher.AEAD
}

// Init initializes the global encryptor with the given key.
// The key is hashed with SHA-256 to ensure a 32-byte AES key.
func Init(key string) error {
	var initErr error
	once = sync.Once{}
	once.Do(func() {
		hash := sha256.Sum256([]byte(key))
		block, err := aes.NewCipher(hash[:])
		if err != nil {
			initErr = fmt.Errorf("create cipher: %w", err)
			return
		}
		gcm, err := cipher.NewGCM(block)
		if err != nil {
			initErr = fmt.Errorf("create GCM: %w", err)
			return
		}
		instance = &Encryptor{gcm: gcm}
	})
	return initErr
}

// Encrypt encrypts plaintext and returns base64-encoded ciphertext.
// Returns the original string if encryption is not initialized.
func Encrypt(plaintext string) (string, error) {
	if instance == nil || plaintext == "" {
		return plaintext, nil
	}

	nonce := make([]byte, instance.gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("generate nonce: %w", err)
	}

	ciphertext := instance.gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// Decrypt decrypts base64-encoded ciphertext and returns plaintext.
// Returns the original string if decryption fails (for backward compatibility with unencrypted data).
func Decrypt(encoded string) (string, error) {
	if instance == nil || encoded == "" {
		return encoded, nil
	}

	ciphertext, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		// Not encrypted data, return as-is
		return encoded, nil
	}

	nonceSize := instance.gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		// Not encrypted data, return as-is
		return encoded, nil
	}

	nonce, ciphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := instance.gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		// Decryption failed, likely unencrypted data
		return encoded, nil
	}

	return string(plaintext), nil
}

// IsEncrypted checks if the given string appears to be encrypted.
// Returns false for empty strings or when encryption is not initialized.
func IsEncrypted(s string) bool {
	if instance == nil || s == "" {
		return false
	}

	ciphertext, err := base64.StdEncoding.DecodeString(s)
	if err != nil {
		return false
	}

	nonceSize := instance.gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return false
	}

	nonce, ct := ciphertext[:nonceSize], ciphertext[nonceSize:]
	_, err = instance.gcm.Open(nil, nonce, ct, nil)
	return err == nil
}

// Enabled returns true if encryption has been initialized.
func Enabled() bool {
	return instance != nil
}
