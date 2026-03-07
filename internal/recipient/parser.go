package recipient

import (
	"encoding/csv"
	"fmt"
	"io"
	"strings"

	"github.com/xuri/excelize/v2"
)

// ParseCSV parses a CSV file with headers. The "email" and "name" columns are mapped
// to the Recipient fields directly; any additional columns are stored in Variables.
func ParseCSV(reader io.Reader) ([]Recipient, error) {
	csvReader := csv.NewReader(reader)
	csvReader.TrimLeadingSpace = true

	headers, err := csvReader.Read()
	if err != nil {
		return nil, fmt.Errorf("failed to read CSV headers: %w", err)
	}

	// Normalize headers to lowercase
	for i, h := range headers {
		headers[i] = strings.TrimSpace(strings.ToLower(h))
	}

	emailIdx := -1
	nameIdx := -1
	for i, h := range headers {
		switch h {
		case "email":
			emailIdx = i
		case "name":
			nameIdx = i
		}
	}

	if emailIdx == -1 {
		return nil, fmt.Errorf("CSV must contain an 'email' column")
	}

	var recipients []Recipient
	lineNum := 1
	for {
		record, err := csvReader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("failed to read CSV line %d: %w", lineNum+1, err)
		}
		lineNum++

		if emailIdx >= len(record) {
			continue
		}

		email := strings.TrimSpace(record[emailIdx])
		if email == "" {
			continue
		}

		var name string
		if nameIdx >= 0 && nameIdx < len(record) {
			name = strings.TrimSpace(record[nameIdx])
		}

		variables := make(JSONMap)
		for i, h := range headers {
			if i == emailIdx || i == nameIdx {
				continue
			}
			if i < len(record) {
				variables[h] = strings.TrimSpace(record[i])
			}
		}

		recipients = append(recipients, Recipient{
			Email:     email,
			Name:      name,
			Variables: variables,
			Status:    "pending",
		})
	}

	return recipients, nil
}

// ParseExcel parses the first sheet of an Excel file using the same logic as ParseCSV.
// The first row is treated as headers.
func ParseExcel(reader io.Reader) ([]Recipient, error) {
	f, err := excelize.OpenReader(reader)
	if err != nil {
		return nil, fmt.Errorf("failed to open Excel file: %w", err)
	}
	defer f.Close()

	sheetName := f.GetSheetName(0)
	if sheetName == "" {
		return nil, fmt.Errorf("no sheets found in Excel file")
	}

	rows, err := f.GetRows(sheetName)
	if err != nil {
		return nil, fmt.Errorf("failed to read Excel rows: %w", err)
	}

	if len(rows) < 1 {
		return nil, fmt.Errorf("Excel file is empty")
	}

	headers := rows[0]
	for i, h := range headers {
		headers[i] = strings.TrimSpace(strings.ToLower(h))
	}

	emailIdx := -1
	nameIdx := -1
	for i, h := range headers {
		switch h {
		case "email":
			emailIdx = i
		case "name":
			nameIdx = i
		}
	}

	if emailIdx == -1 {
		return nil, fmt.Errorf("Excel file must contain an 'email' column")
	}

	var recipients []Recipient
	for _, row := range rows[1:] {
		if emailIdx >= len(row) {
			continue
		}

		email := strings.TrimSpace(row[emailIdx])
		if email == "" {
			continue
		}

		var name string
		if nameIdx >= 0 && nameIdx < len(row) {
			name = strings.TrimSpace(row[nameIdx])
		}

		variables := make(JSONMap)
		for i, h := range headers {
			if i == emailIdx || i == nameIdx {
				continue
			}
			if i < len(row) {
				variables[h] = strings.TrimSpace(row[i])
			}
		}

		recipients = append(recipients, Recipient{
			Email:     email,
			Name:      name,
			Variables: variables,
			Status:    "pending",
		})
	}

	return recipients, nil
}
