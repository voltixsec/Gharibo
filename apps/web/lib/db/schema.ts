/**
 * SQLite schema — all CREATE TABLE IF NOT EXISTS statements.
 * Source of truth for persistence (architecture §3.4).
 * Columns are snake_case; TS domain objects are camelCase; repositories map.
 */

/** Array of CREATE TABLE IF NOT EXISTS statements, in dependency order. */
export const SCHEMA_STATEMENTS: string[] = [
  // providers
  `CREATE TABLE IF NOT EXISTS providers (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    model_id TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key_ref TEXT,
    context_window INTEGER NOT NULL DEFAULT 4096,
    supports_vision INTEGER NOT NULL DEFAULT 0,
    supports_tools INTEGER NOT NULL DEFAULT 0,
    supports_structured_output INTEGER NOT NULL DEFAULT 0,
    supports_reasoning INTEGER NOT NULL DEFAULT 0,
    display_name TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,

  // conversations
  `CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    provider_id TEXT,
    model_id TEXT,
    system_prompt TEXT,
    temperature REAL NOT NULL DEFAULT 0.7,
    max_tokens INTEGER NOT NULL DEFAULT 2048,
    tools_enabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE SET NULL
  );`,

  // messages
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    model_id TEXT,
    provider_id TEXT,
    quality_signal TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );`,

  // training_examples
  `CREATE TABLE IF NOT EXISTS training_examples (
    id TEXT PRIMARY KEY,
    prompt TEXT NOT NULL,
    system_prompt TEXT,
    response TEXT NOT NULL,
    approved_response TEXT,
    model_id TEXT,
    provider_id TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    domain TEXT,
    language TEXT,
    quality_score REAL,
    approval_state TEXT NOT NULL DEFAULT 'pending',
    source_conversation_id TEXT,
    source_message_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,

  // data_factory_records
  `CREATE TABLE IF NOT EXISTS data_factory_records (
    id TEXT PRIMARY KEY,
    task_type TEXT,
    domain TEXT,
    language TEXT,
    input TEXT NOT NULL,
    context TEXT,
    expected_output TEXT,
    chosen_output TEXT,
    rejected_output TEXT,
    source TEXT,
    source_url TEXT,
    license TEXT,
    verification_status TEXT NOT NULL DEFAULT 'RAW',
    quality_score REAL,
    difficulty TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    validation_results TEXT NOT NULL DEFAULT '[]',
    source_training_example_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (source_training_example_id) REFERENCES training_examples(id) ON DELETE SET NULL
  );`,

  // datasets
  `CREATE TABLE IF NOT EXISTS datasets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    record_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    UNIQUE(name, version)
  );`,

  // dataset_records
  `CREATE TABLE IF NOT EXISTS dataset_records (
    dataset_id TEXT NOT NULL,
    record_id TEXT NOT NULL,
    PRIMARY KEY (dataset_id, record_id),
    FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
    FOREIGN KEY (record_id) REFERENCES data_factory_records(id) ON DELETE CASCADE
  );`,

  // training_runs
  `CREATE TABLE IF NOT EXISTS training_runs (
    run_id TEXT PRIMARY KEY,
    base_model TEXT NOT NULL,
    method TEXT NOT NULL,
    dataset_id TEXT,
    dataset_version TEXT,
    train_examples INTEGER,
    validation_examples INTEGER,
    epochs INTEGER,
    learning_rate REAL,
    batch_size INTEGER,
    gradient_accumulation INTEGER,
    lora_rank INTEGER,
    lora_alpha INTEGER,
    target_modules TEXT NOT NULL DEFAULT '[]',
    quantization TEXT,
    seed INTEGER,
    device TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    start_time TEXT,
    end_time TEXT,
    checkpoint_path TEXT,
    logs TEXT,
    metrics TEXT NOT NULL DEFAULT '{}',
    preflight_result TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE SET NULL
  );`,

  // model_registry
  `CREATE TABLE IF NOT EXISTS model_registry (
    id TEXT PRIMARY KEY,
    model_name TEXT NOT NULL,
    version TEXT NOT NULL,
    base_model TEXT,
    training_run_id TEXT,
    dataset_version TEXT,
    training_method TEXT,
    checkpoint_location TEXT,
    adapter_location TEXT,
    evaluation_score TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'EXPERIMENT',
    notes TEXT,
    created_date TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (training_run_id) REFERENCES training_runs(run_id) ON DELETE SET NULL
  );`,

  // research_records
  `CREATE TABLE IF NOT EXISTS research_records (
    id TEXT PRIMARY KEY,
    task TEXT NOT NULL,
    instructions TEXT,
    input TEXT,
    sources_considered TEXT NOT NULL DEFAULT '[]',
    source_snippets TEXT NOT NULL DEFAULT '[]',
    candidate_entities TEXT NOT NULL DEFAULT '[]',
    generated_records TEXT NOT NULL DEFAULT '[]',
    validation_failures TEXT NOT NULL DEFAULT '[]',
    duplicates_found TEXT NOT NULL DEFAULT '[]',
    corrections TEXT NOT NULL DEFAULT '[]',
    final_approved_records TEXT NOT NULL DEFAULT '[]',
    reward_score REAL,
    model_used TEXT,
    duration INTEGER,
    created_at TEXT NOT NULL
  );`,

  // experiments
  `CREATE TABLE IF NOT EXISTS experiments (
    id TEXT PRIMARY KEY,
    code_version TEXT,
    model_id TEXT,
    dataset_version TEXT,
    configuration TEXT NOT NULL DEFAULT '{}',
    seed INTEGER,
    results TEXT NOT NULL DEFAULT '{}',
    notes TEXT,
    training_run_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (model_id) REFERENCES model_registry(id) ON DELETE SET NULL,
    FOREIGN KEY (training_run_id) REFERENCES training_runs(run_id) ON DELETE SET NULL
  );`,

  // evaluation_results
  `CREATE TABLE IF NOT EXISTS evaluation_results (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL,
    benchmark_category TEXT NOT NULL,
    score REAL,
    base_model_score REAL,
    regressions TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    FOREIGN KEY (model_id) REFERENCES model_registry(id) ON DELETE CASCADE
  );`,

  // settings
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,

  // --- M2 tables (architecture §6.1) ---

  // training_packages — issued, immutable Training Packages.
  `CREATE TABLE IF NOT EXISTS training_packages (
    id TEXT PRIMARY KEY,
    experiment_id TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    manifest TEXT NOT NULL,
    manifest_hash TEXT NOT NULL,
    dataset_id TEXT,
    dataset_version_id TEXT,
    run_id TEXT,
    worker_id TEXT NOT NULL DEFAULT 'kaggle',
    notebook_sha256 TEXT,
    bundle_path TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE SET NULL,
    FOREIGN KEY (run_id) REFERENCES training_runs(run_id) ON DELETE SET NULL
  );`,

  // dataset_splits — deterministic split membership per dataset version.
  `CREATE TABLE IF NOT EXISTS dataset_splits (
    dataset_id TEXT NOT NULL,
    split_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    record_line_hash TEXT NOT NULL,
    PRIMARY KEY (dataset_id, split_name, record_id),
    FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
    FOREIGN KEY (record_id) REFERENCES data_factory_records(id) ON DELETE CASCADE
  );`,

  // training_artifacts — per-file artifact integrity hashes (manifest-of-hashes).
  `CREATE TABLE IF NOT EXISTS training_artifacts (
    id TEXT PRIMARY KEY,
    package_id TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    kind TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    rollup_hash TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (package_id) REFERENCES training_packages(id) ON DELETE CASCADE
  );`,

  // training_run_events — resilience state-transition audit log.
  `CREATE TABLE IF NOT EXISTS training_run_events (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT NOT NULL,
    reason TEXT,
    source TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES training_runs(run_id) ON DELETE CASCADE
  );`,

  // Indexes for performance on common queries
  `CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);`,
  `CREATE INDEX IF NOT EXISTS idx_data_factory_status ON data_factory_records(verification_status);`,
  `CREATE INDEX IF NOT EXISTS idx_data_factory_domain ON data_factory_records(domain);`,
  `CREATE INDEX IF NOT EXISTS idx_training_examples_state ON training_examples(approval_state);`,
  `CREATE INDEX IF NOT EXISTS idx_training_runs_status ON training_runs(status);`,
  `CREATE INDEX IF NOT EXISTS idx_evaluations_model ON evaluation_results(model_id);`,
  `CREATE INDEX IF NOT EXISTS idx_dataset_records_dataset ON dataset_records(dataset_id);`,
  // M2 indexes
  `CREATE INDEX IF NOT EXISTS idx_training_packages_experiment ON training_packages(experiment_id);`,
  `CREATE INDEX IF NOT EXISTS idx_dataset_splits_dataset ON dataset_splits(dataset_id, split_name);`,
  `CREATE INDEX IF NOT EXISTS idx_training_artifacts_package ON training_artifacts(package_id);`,
  `CREATE INDEX IF NOT EXISTS idx_run_events_run ON training_run_events(run_id);`,
];

/** Default settings seeded on first migration. */
export const DEFAULT_SETTINGS: Record<string, string> = {
  "ui.theme": "system",
  "ui.defaultTemperature": "0.7",
  "ui.defaultMaxTokens": "2048",
  "training.defaultBaseModel": "meta-llama/Llama-3.1-8B-Instruct",
  "training.defaultMethod": "lora",
  "training.defaultEpochs": "3",
  "training.defaultBatchSize": "4",
  "training.defaultLearningRate": "0.0002",
  "training.defaultLoraRank": "16",
  "training.defaultLoraAlpha": "32",
};
