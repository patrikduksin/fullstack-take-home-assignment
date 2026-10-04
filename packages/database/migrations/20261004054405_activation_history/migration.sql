CREATE TABLE `funnel_activations` (
	`sequence` integer PRIMARY KEY AUTOINCREMENT,
	`version` text NOT NULL,
	`previous_version` text,
	`kind` text NOT NULL,
	`activated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT `fk_funnel_activations_version_funnel_versions_version_fk` FOREIGN KEY (`version`) REFERENCES `funnel_versions`(`version`),
	CONSTRAINT `fk_funnel_activations_previous_version_funnel_versions_version_fk` FOREIGN KEY (`previous_version`) REFERENCES `funnel_versions`(`version`),
	CONSTRAINT "funnel_activations_kind" CHECK("kind" IN ('initial', 'publish', 'rollback'))
);
--> statement-breakpoint
CREATE TRIGGER funnel_activation_updates_pointer AFTER INSERT ON funnel_activations
BEGIN
  UPDATE funnel_active SET version = NEW.version WHERE singleton = 1;
END;
--> statement-breakpoint
INSERT INTO funnel_activations(version, previous_version, kind)
SELECT version, NULL, 'initial' FROM funnel_active WHERE singleton = 1;
