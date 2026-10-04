CREATE TABLE `funnel_events` (
	`client_timestamp` text NOT NULL,
	`event_id` text PRIMARY KEY,
	`properties` text NOT NULL,
	`server_timestamp` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`session_id` text NOT NULL,
	`step_id` text,
	`type` text NOT NULL,
	`utm` text NOT NULL,
	`variant` text NOT NULL,
	`version` text NOT NULL,
	CONSTRAINT `fk_funnel_events_session_id_funnel_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `funnel_sessions`(`id`),
	CONSTRAINT `fk_funnel_events_version_funnel_versions_version_fk` FOREIGN KEY (`version`) REFERENCES `funnel_versions`(`version`),
	CONSTRAINT "funnel_events_utm_json" CHECK(json_valid("utm")),
	CONSTRAINT "funnel_events_properties_json" CHECK(json_valid("properties")),
	CONSTRAINT "funnel_events_variant" CHECK("variant" IN ('A', 'B'))
);

--> statement-breakpoint
UPDATE funnel_sessions SET state = json_set(state, '$.utm', json('{}')) WHERE json_type(state, '$.utm') IS NULL;
--> statement-breakpoint
INSERT INTO funnel_events(event_id, type, session_id, client_timestamp, server_timestamp, version, variant, step_id, utm, properties)
SELECT 'session_started:' || id, 'session_started', id, strftime('%Y-%m-%dT%H:%M:%fZ', created_at), strftime('%Y-%m-%dT%H:%M:%fZ', created_at), version, variant, NULL, json_extract(state, '$.utm'), '{}'
FROM funnel_sessions;
--> statement-breakpoint
CREATE TRIGGER funnel_session_started AFTER INSERT ON funnel_sessions
BEGIN
  INSERT INTO funnel_events(event_id, type, session_id, client_timestamp, server_timestamp, version, variant, step_id, utm, properties)
  VALUES ('session_started:' || NEW.id, 'session_started', NEW.id, strftime('%Y-%m-%dT%H:%M:%fZ', NEW.created_at), strftime('%Y-%m-%dT%H:%M:%fZ', NEW.created_at), NEW.version, NEW.variant, NULL, COALESCE(json_extract(NEW.state, '$.utm'), '{}'), '{}');
END;
