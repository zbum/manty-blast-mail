-- +migrate Up

CREATE INDEX idx_recipients_campaign_email ON recipients (campaign_id, email);
CREATE INDEX idx_recipients_campaign_name ON recipients (campaign_id, name);

-- +migrate Down

DROP INDEX idx_recipients_campaign_email ON recipients;
DROP INDEX idx_recipients_campaign_name ON recipients;
