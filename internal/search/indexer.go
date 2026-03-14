package search

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/blevesearch/bleve/v2"
	"github.com/blevesearch/bleve/v2/mapping"
	"github.com/blevesearch/bleve/v2/search/query"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"

	"github.com/zbum/manty-blast-mail/internal/crypto"
)

// Document types stored in the index
const (
	DocTypeCampaign  = "campaign"
	DocTypeRecipient = "recipient"
	DocTypeAudit     = "audit"
)

// IndexDoc represents a document in the search index.
type IndexDoc struct {
	Type       string    `json:"type"`
	DocID      uint64    `json:"doc_id"`
	OwnerID    uint64    `json:"owner_id"` // campaign's user_id or 0
	CampaignID uint64    `json:"campaign_id"`
	Name       string    `json:"name"`
	Content    string    `json:"content"`
	Status     string    `json:"status"`
	CreatedAt  time.Time `json:"created_at"`
}

const metaKey = "_meta:last_sync"

// metaDoc stores the last sync timestamp in the index.
type metaDoc struct {
	Type      string    `json:"type"`
	SyncTime  time.Time `json:"sync_time"`
}

// Indexer manages the Bleve full-text search index.
type Indexer struct {
	index bleve.Index
	db    *gorm.DB
}

func buildMapping() mapping.IndexMapping {
	indexMapping := bleve.NewIndexMapping()

	// Default analyzer is "standard" which does lowercase + tokenize
	docMapping := bleve.NewDocumentMapping()

	textField := bleve.NewTextFieldMapping()
	textField.Analyzer = "standard"

	keywordField := bleve.NewKeywordFieldMapping()

	numField := bleve.NewNumericFieldMapping()

	dateField := bleve.NewDateTimeFieldMapping()

	docMapping.AddFieldMappingsAt("type", keywordField)
	docMapping.AddFieldMappingsAt("doc_id", numField)
	docMapping.AddFieldMappingsAt("owner_id", numField)
	docMapping.AddFieldMappingsAt("campaign_id", numField)
	docMapping.AddFieldMappingsAt("name", textField)
	docMapping.AddFieldMappingsAt("content", textField)
	docMapping.AddFieldMappingsAt("status", keywordField)
	docMapping.AddFieldMappingsAt("created_at", dateField)

	indexMapping.DefaultMapping = docMapping

	return indexMapping
}

// NewIndexer creates or opens a Bleve index at the given path, backed by the DB.
func NewIndexer(indexPath string, db *gorm.DB) (*Indexer, error) {
	// Try to open existing index first
	idx, err := bleve.Open(indexPath)
	if err == nil {
		log.Info().Msg("opened existing bleve search index")
		return &Indexer{index: idx, db: db}, nil
	}

	// If open failed (not found or corrupted), create new
	if err2 := os.RemoveAll(indexPath); err2 != nil && !os.IsNotExist(err2) {
		return nil, fmt.Errorf("failed to clean index dir: %w", err2)
	}

	idx, err = bleve.New(indexPath, buildMapping())
	if err != nil {
		return nil, fmt.Errorf("failed to create bleve index: %w", err)
	}

	log.Info().Msg("created new bleve search index")
	return &Indexer{index: idx, db: db}, nil
}

// Close closes the index.
func (ix *Indexer) Close() error {
	return ix.index.Close()
}

// Sync performs incremental sync: indexes only records updated after the last sync time.
// If the index is empty (new), it does a full rebuild.
func (ix *Indexer) Sync() {
	start := time.Now()
	since := ix.getLastSyncTime()

	if since.IsZero() {
		// Full rebuild
		cc := ix.indexCampaignsSince(time.Time{})
		rc := ix.indexRecipientsSince(time.Time{})
		ac := ix.indexAuditLogsSince(time.Time{})

		ix.saveLastSyncTime(start)

		log.Info().
			Int("campaigns", cc).
			Int("recipients", rc).
			Int("audit_logs", ac).
			Dur("elapsed", time.Since(start)).
			Msg("bleve search index full rebuild completed")
	} else {
		cc := ix.indexCampaignsSince(since)
		rc := ix.indexRecipientsSince(since)
		ac := ix.indexAuditLogsSince(since)

		ix.removeDeletedDocuments(since)
		ix.saveLastSyncTime(start)

		total := cc + rc + ac
		if total > 0 {
			log.Info().
				Int("campaigns", cc).
				Int("recipients", rc).
				Int("audit_logs", ac).
				Dur("elapsed", time.Since(start)).
				Msg("bleve search index incremental sync completed")
		} else {
			log.Info().
				Dur("elapsed", time.Since(start)).
				Msg("bleve search index is up to date")
		}
	}
}

func (ix *Indexer) getLastSyncTime() time.Time {
	doc, err := ix.index.Document(metaKey)
	if err != nil || doc == nil {
		return time.Time{}
	}

	// Search for the meta doc to get sync_time field
	q := bleve.NewDocIDQuery([]string{metaKey})
	req := bleve.NewSearchRequestOptions(q, 1, 0, false)
	req.Fields = []string{"sync_time"}
	result, err := ix.index.Search(req)
	if err != nil || len(result.Hits) == 0 {
		return time.Time{}
	}
	if ts, ok := result.Hits[0].Fields["sync_time"].(string); ok {
		t, _ := time.Parse(time.RFC3339, ts)
		return t
	}
	return time.Time{}
}

func (ix *Indexer) saveLastSyncTime(t time.Time) {
	ix.index.Index(metaKey, metaDoc{Type: "_meta", SyncTime: t})
}

// removeDeletedDocuments checks for DB records that were deleted and removes them from the index.
func (ix *Indexer) removeDeletedDocuments(since time.Time) {
	// Check campaigns: get all indexed campaign IDs and verify against DB
	ix.removeDeletedByType(DocTypeCampaign, "campaigns")
	// Audit logs are append-only, no need to check deletions
}

func (ix *Indexer) removeDeletedByType(docType, tableName string) {
	typeQ := bleve.NewTermQuery(docType)
	typeQ.SetField("type")
	req := bleve.NewSearchRequestOptions(typeQ, 100000, 0, false)
	req.Fields = []string{"doc_id"}

	result, err := ix.index.Search(req)
	if err != nil || len(result.Hits) == 0 {
		return
	}

	indexedIDs := make(map[uint64]string) // doc_id -> bleve key
	for _, hit := range result.Hits {
		docID := uint64(getFloat(hit.Fields["doc_id"]))
		if docID > 0 {
			indexedIDs[docID] = hit.ID
		}
	}

	// Get existing IDs from DB
	ids := make([]uint64, 0, len(indexedIDs))
	for id := range indexedIDs {
		ids = append(ids, id)
	}

	var existingIDs []uint64
	ix.db.Table(tableName).Select("id").Where("id IN ?", ids).Pluck("id", &existingIDs)

	existingSet := make(map[uint64]bool, len(existingIDs))
	for _, id := range existingIDs {
		existingSet[id] = true
	}

	batch := ix.index.NewBatch()
	deleted := 0
	for docID, bleveKey := range indexedIDs {
		if !existingSet[docID] {
			batch.Delete(bleveKey)
			deleted++
		}
	}
	if deleted > 0 {
		ix.index.Batch(batch)
		log.Info().Int("count", deleted).Str("type", docType).Msg("removed deleted documents from index")
	}
}

// --- Batch indexing helpers (with incremental since filter) ---

func (ix *Indexer) indexCampaignsSince(since time.Time) int {
	const batchSize = 500
	var offset, total int

	for {
		var rows []struct {
			ID        uint64    `gorm:"column:id"`
			UserID    uint64    `gorm:"column:user_id"`
			Name      string    `gorm:"column:name"`
			Subject   string    `gorm:"column:subject"`
			Status    string    `gorm:"column:status"`
			CreatedAt time.Time `gorm:"column:created_at"`
		}
		q := ix.db.Table("campaigns").
			Select("id, user_id, name, subject, status, created_at").
			Order("id ASC").Offset(offset).Limit(batchSize)
		if !since.IsZero() {
			q = q.Where("updated_at >= ?", since)
		}
		if err := q.Scan(&rows).Error; err != nil || len(rows) == 0 {
			break
		}

		batch := ix.index.NewBatch()
		for _, r := range rows {
			doc := IndexDoc{
				Type:      DocTypeCampaign,
				DocID:     r.ID,
				OwnerID:   r.UserID,
				Name:      r.Name,
				Content:   r.Subject,
				Status:    r.Status,
				CreatedAt: r.CreatedAt,
			}
			batch.Index(campaignKey(r.ID), doc)
		}
		ix.index.Batch(batch)
		total += len(rows)
		offset += len(rows)
		if len(rows) < batchSize {
			break
		}
	}
	return total
}

func (ix *Indexer) indexRecipientsSince(since time.Time) int {
	const batchSize = 1000
	var offset, total int

	for {
		var rows []recipientScanRow
		q := ix.db.Table("recipients").
			Select("id, campaign_id, email, name, status").
			Order("id ASC").Offset(offset).Limit(batchSize)
		if !since.IsZero() {
			q = q.Where("updated_at >= ?", since)
		}
		if err := q.Scan(&rows).Error; err != nil || len(rows) == 0 {
			break
		}

		campaignOwners := ix.getCampaignOwnerIDs(rows)

		batch := ix.index.NewBatch()
		for _, r := range rows {
			email := r.Email
			name := r.Name
			if d, err := crypto.Decrypt(email); err == nil {
				email = d
			}
			if d, err := crypto.Decrypt(name); err == nil {
				name = d
			}

			displayName := email
			if name != "" {
				displayName = name + " <" + email + ">"
			}

			doc := IndexDoc{
				Type:       DocTypeRecipient,
				DocID:      r.ID,
				OwnerID:    campaignOwners[r.CampaignID],
				CampaignID: r.CampaignID,
				Name:       displayName,
				Content:    email + " " + name,
				Status:     r.Status,
			}
			batch.Index(recipientKey(r.ID), doc)
		}
		ix.index.Batch(batch)
		total += len(rows)
		offset += len(rows)
		if len(rows) < batchSize {
			break
		}
	}
	return total
}

type recipientScanRow struct {
	ID         uint64 `gorm:"column:id"`
	CampaignID uint64 `gorm:"column:campaign_id"`
	Email      string `gorm:"column:email"`
	Name       string `gorm:"column:name"`
	Status     string `gorm:"column:status"`
}

func (ix *Indexer) getCampaignOwnerIDs(rows []recipientScanRow) map[uint64]uint64 {
	idSet := map[uint64]bool{}
	for _, r := range rows {
		idSet[r.CampaignID] = true
	}

	ids := make([]uint64, 0, len(idSet))
	for id := range idSet {
		ids = append(ids, id)
	}
	if len(ids) == 0 {
		return nil
	}

	var campaigns []struct {
		ID     uint64 `gorm:"column:id"`
		UserID uint64 `gorm:"column:user_id"`
	}
	ix.db.Table("campaigns").Select("id, user_id").Where("id IN ?", ids).Scan(&campaigns)

	result := make(map[uint64]uint64, len(campaigns))
	for _, c := range campaigns {
		result[c.ID] = c.UserID
	}
	return result
}

func (ix *Indexer) indexAuditLogsSince(since time.Time) int {
	const batchSize = 500
	var offset, total int

	for {
		var rows []struct {
			ID         uint64    `gorm:"column:id"`
			ActorName  string    `gorm:"column:actor_name"`
			Action     string    `gorm:"column:action"`
			TargetName string    `gorm:"column:target_name"`
			Detail     string    `gorm:"column:detail"`
			CreatedAt  time.Time `gorm:"column:created_at"`
		}
		q := ix.db.Table("audit_logs").
			Select("id, actor_name, action, target_name, detail, created_at").
			Order("id ASC").Offset(offset).Limit(batchSize)
		if !since.IsZero() {
			q = q.Where("created_at >= ?", since)
		}
		if err := q.Scan(&rows).Error; err != nil || len(rows) == 0 {
			break
		}

		batch := ix.index.NewBatch()
		for _, r := range rows {
			doc := IndexDoc{
				Type:      DocTypeAudit,
				DocID:     r.ID,
				Name:      r.ActorName + " → " + r.TargetName,
				Content:   r.Action + " " + r.Detail + " " + r.ActorName + " " + r.TargetName,
				Status:    r.Action,
				CreatedAt: r.CreatedAt,
			}
			batch.Index(auditKey(r.ID), doc)
		}
		ix.index.Batch(batch)
		total += len(rows)
		offset += len(rows)
		if len(rows) < batchSize {
			break
		}
	}
	return total
}

// --- Real-time index updates ---

// IndexCampaign indexes or updates a single campaign.
func (ix *Indexer) IndexCampaign(id, userID uint64, name, subject, status string, createdAt time.Time) {
	doc := IndexDoc{
		Type:      DocTypeCampaign,
		DocID:     id,
		OwnerID:   userID,
		Name:      name,
		Content:   subject,
		Status:    status,
		CreatedAt: createdAt,
	}
	ix.index.Index(campaignKey(id), doc)
}

// DeleteCampaign removes a campaign from the index.
func (ix *Indexer) DeleteCampaign(id uint64) {
	ix.index.Delete(campaignKey(id))
}

// IndexRecipient indexes a single recipient (pass decrypted email/name).
func (ix *Indexer) IndexRecipient(id, campaignID, ownerID uint64, email, name, status string) {
	displayName := email
	if name != "" {
		displayName = name + " <" + email + ">"
	}
	doc := IndexDoc{
		Type:       DocTypeRecipient,
		DocID:      id,
		OwnerID:    ownerID,
		CampaignID: campaignID,
		Name:       displayName,
		Content:    email + " " + name,
		Status:     status,
	}
	ix.index.Index(recipientKey(id), doc)
}

// IndexRecipientsBatch indexes a batch of recipients for a campaign.
func (ix *Indexer) IndexRecipientsBatch(campaignID, ownerID uint64, recipients []struct {
	ID     uint64
	Email  string
	Name   string
	Status string
}) {
	batch := ix.index.NewBatch()
	for _, r := range recipients {
		displayName := r.Email
		if r.Name != "" {
			displayName = r.Name + " <" + r.Email + ">"
		}
		doc := IndexDoc{
			Type:       DocTypeRecipient,
			DocID:      r.ID,
			OwnerID:    ownerID,
			CampaignID: campaignID,
			Name:       displayName,
			Content:    r.Email + " " + r.Name,
			Status:     r.Status,
		}
		batch.Index(recipientKey(r.ID), doc)
	}
	ix.index.Batch(batch)
}

// DeleteRecipient removes a recipient from the index.
func (ix *Indexer) DeleteRecipient(id uint64) {
	ix.index.Delete(recipientKey(id))
}

// DeleteRecipientsByCampaign removes all recipients for a campaign from the index.
func (ix *Indexer) DeleteRecipientsByCampaign(campaignID uint64) {
	// Search for all recipients of this campaign and delete them
	q := bleve.NewTermQuery(DocTypeRecipient)
	q.SetField("type")

	numQ := bleve.NewNumericRangeQuery(ptrFloat(float64(campaignID)), ptrFloat(float64(campaignID)))
	numQ.SetField("campaign_id")

	query := bleve.NewConjunctionQuery(q, numQ)
	searchReq := bleve.NewSearchRequestOptions(query, 10000, 0, false)

	result, err := ix.index.Search(searchReq)
	if err != nil {
		return
	}

	batch := ix.index.NewBatch()
	for _, hit := range result.Hits {
		batch.Delete(hit.ID)
	}
	ix.index.Batch(batch)
}

// IndexAuditLog indexes a single audit log entry.
func (ix *Indexer) IndexAuditLog(id uint64, actorName, action, targetName, detail string, createdAt time.Time) {
	doc := IndexDoc{
		Type:      DocTypeAudit,
		DocID:     id,
		Name:      actorName + " → " + targetName,
		Content:   action + " " + detail + " " + actorName + " " + targetName,
		Status:    action,
		CreatedAt: createdAt,
	}
	ix.index.Index(auditKey(id), doc)
}

// Search performs a full-text search with type and owner filtering.
func (ix *Indexer) Search(queryStr string, userID uint64, role string, maxResults int) []searchResult {
	if maxResults == 0 {
		maxResults = 50
	}

	// Build a match query for the user's search text
	matchQuery := bleve.NewQueryStringQuery(escapeQuery(queryStr))

	// For non-admin users, build a disjunction of:
	// 1. campaigns/recipients owned by this user
	// 2. (no audit logs)
	var finalQuery query.Query
	if role == "admin" {
		finalQuery = matchQuery
	} else {
		// owner_id == userID
		ownerQ := bleve.NewNumericRangeQuery(ptrFloat(float64(userID)), ptrFloat(float64(userID)))
		ownerQ.SetField("owner_id")

		// Only campaign and recipient types (not audit)
		typeCampaign := bleve.NewTermQuery(DocTypeCampaign)
		typeCampaign.SetField("type")
		typeRecipient := bleve.NewTermQuery(DocTypeRecipient)
		typeRecipient.SetField("type")
		typeFilter := bleve.NewDisjunctionQuery(typeCampaign, typeRecipient)

		finalQuery = bleve.NewConjunctionQuery(matchQuery, ownerQ, typeFilter)
	}

	searchReq := bleve.NewSearchRequestOptions(finalQuery, maxResults, 0, false)
	searchReq.Fields = []string{"type", "doc_id", "owner_id", "campaign_id", "name", "content", "status", "created_at"}
	searchReq.SortBy([]string{"-_score", "-created_at"})

	result, err := ix.index.Search(searchReq)
	if err != nil {
		log.Error().Err(err).Str("query", queryStr).Msg("bleve search failed")
		return nil
	}

	var results []searchResult
	for _, hit := range result.Hits {
		docType, _ := hit.Fields["type"].(string)
		docID := uint64(getFloat(hit.Fields["doc_id"]))
		name, _ := hit.Fields["name"].(string)
		content, _ := hit.Fields["content"].(string)
		status, _ := hit.Fields["status"].(string)
		campaignID := uint64(getFloat(hit.Fields["campaign_id"]))

		sr := searchResult{
			Type: docType,
			ID:   docID,
			Name: name,
		}

		switch docType {
		case DocTypeCampaign:
			sr.Desc = content + " [" + status + "]"
			sr.URL = "/campaigns/" + itoa(docID)
		case DocTypeRecipient:
			sr.Desc = status
			sr.URL = "/campaigns/" + itoa(campaignID)
		case DocTypeAudit:
			sr.Desc = status
			sr.URL = "/audit-logs"
		}

		if t, ok := hit.Fields["created_at"].(string); ok {
			if parsed, err := time.Parse(time.RFC3339, t); err == nil {
				sr.Time = &parsed
			}
		}

		results = append(results, sr)
	}
	return results
}

// escapeQuery escapes special Bleve query syntax characters for safe prefix/wildcard search.
func escapeQuery(q string) string {
	// For simple substring search, wrap in wildcards
	q = strings.ReplaceAll(q, `\`, `\\`)
	q = strings.ReplaceAll(q, `"`, `\"`)
	q = strings.ReplaceAll(q, `:`, `\:`)
	q = strings.ReplaceAll(q, `+`, `\+`)
	q = strings.ReplaceAll(q, `-`, `\-`)
	q = strings.ReplaceAll(q, `!`, `\!`)
	q = strings.ReplaceAll(q, `(`, `\(`)
	q = strings.ReplaceAll(q, `)`, `\)`)
	q = strings.ReplaceAll(q, `{`, `\{`)
	q = strings.ReplaceAll(q, `}`, `\}`)
	q = strings.ReplaceAll(q, `[`, `\[`)
	q = strings.ReplaceAll(q, `]`, `\]`)
	q = strings.ReplaceAll(q, `^`, `\^`)
	q = strings.ReplaceAll(q, `~`, `\~`)

	// Use wildcard matching for partial matches
	terms := strings.Fields(q)
	for i, t := range terms {
		terms[i] = "*" + t + "*"
	}
	return strings.Join(terms, " ")
}

func ptrFloat(f float64) *float64 { return &f }

func getFloat(v interface{}) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case int64:
		return float64(n)
	case string:
		f, _ := strconv.ParseFloat(n, 64)
		return f
	}
	return 0
}

func campaignKey(id uint64) string  { return "campaign:" + itoa(id) }
func recipientKey(id uint64) string { return "recipient:" + itoa(id) }
func auditKey(id uint64) string     { return "audit:" + itoa(id) }

func itoa(n uint64) string {
	if n == 0 {
		return "0"
	}
	return fmt.Sprintf("%d", n)
}
