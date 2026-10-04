CREATE TABLE `funnel_active` (
	`singleton` integer PRIMARY KEY,
	`version` text NOT NULL,
	CONSTRAINT `fk_funnel_active_version_funnel_versions_version_fk` FOREIGN KEY (`version`) REFERENCES `funnel_versions`(`version`),
	CONSTRAINT "funnel_active_singleton" CHECK("singleton" = 1)
);
--> statement-breakpoint
CREATE TABLE `funnel_sessions` (
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`id` text PRIMARY KEY,
	`state` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`variant` text NOT NULL,
	`version` text NOT NULL,
	CONSTRAINT `fk_funnel_sessions_version_funnel_versions_version_fk` FOREIGN KEY (`version`) REFERENCES `funnel_versions`(`version`),
	CONSTRAINT "funnel_sessions_state_json" CHECK(json_valid("state")),
	CONSTRAINT "funnel_sessions_variant" CHECK("variant" IN ('A', 'B'))
);
--> statement-breakpoint
CREATE TABLE `funnel_versions` (
	`configuration` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`version` text PRIMARY KEY,
	CONSTRAINT "funnel_versions_configuration_json" CHECK(json_valid("configuration"))
);

--> statement-breakpoint
INSERT INTO funnel_versions(version, configuration) VALUES ('trail-linear-v1', '{"id":"trail-linear-v1","name":"Trail planning","start":"welcome","steps":[{"id":"welcome","type":"information","title":"Plan a fictional weekend trail","body":"Answer a few questions to discover a sample trail plan. This is a demonstration, not a booking service.","next":"pace"},{"id":"pace","type":"single-select","title":"Choose your pace","options":[{"id":"gentle","label":"Gentle stroll"},{"id":"active","label":"Active hike"}],"next":"interests"},{"id":"interests","type":"multi-select","title":"What would you like to see?","body":"Choose one or two interests.","options":[{"id":"forest","label":"Forest"},{"id":"water","label":"Waterfalls"},{"id":"view","label":"Mountain views"}],"min":1,"max":2,"next":"hours"},{"id":"hours","type":"number","title":"How many hours do you have?","body":"Enter a number from 1 to 8.","min":1,"max":8,"next":"prepare"},{"id":"prepare","type":"information","title":"Before you head out","body":"Bring water, check the weather, and tell someone your route. These are fictional suggestions.","next":"result"},{"id":"result","type":"result","title":"Your sample trail plan is ready","body":"A nearby woodland loop is a good starting point for your fictional weekend.","cta":{"label":"Explore trail ideas","href":"https://www.nps.gov/subjects/trails/index.htm"}}]}');
INSERT INTO funnel_active(singleton, version) VALUES (1, 'trail-linear-v1');
