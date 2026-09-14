# GHARIBO Training Strategy

## Philosophy

GHARIBO follows a disciplined training philosophy:

### What belongs in model weights (training)
- Skills (reasoning, coding, writing, analysis)
- Behavioral patterns (following instructions, structured output)
- Domain knowledge that is stable (taxonomies, frameworks, core concepts)
- Language understanding and generation

### What belongs in tools/retrieval (NOT training)
- Fast-changing information (news, prices, stock data)
- Real-time data (weather, traffic, live metrics)
- Large knowledge bases (product catalogs, documentation)
- External system state (APIs, databases, services)

### Principle
Do not attempt to permanently train daily news, prices, or rapidly changing data into model weights. Use web research, retrieval, tools, and external knowledge stores for dynamic information. Train the model's ability to USE these tools effectively, not to memorize their output.

## Training Methods (Phase 1)

### LoRA (Low-Rank Adaptation)
- Freezes base model weights, trains small adapter matrices
- Efficient: trains <1% of parameters
- Good for: behavioral alignment, style adaptation, domain specialization
- Typical: rank 8-64, alpha 16-128, target modules q_proj/v_proj

### QLoRA (Quantized LoRA)
- Base model quantized to 4-bit (NF4), LoRA adapters trained at full precision
- Dramatically reduces VRAM requirements (fits 7B model in ~6GB VRAM)
- Good for: training on consumer GPUs, rapid experimentation
- Trade-off: slight quality degradation vs full LoRA

### SFT (Supervised Fine-Tuning)
- Full or partial model fine-tuning on curated instruction-response pairs
- Good for: significant behavioral shifts, new capability acquisition
- Requires more VRAM than LoRA/QLoRA
- Typically: full fine-tune or last few layers

## Training Pipeline

```
1. Collect data (Playground saves, Research Gym, external sources)
2. Review & approve in Data Factory
3. Assemble into versioned Dataset
4. Export to JSONL
5. Configure Training Run (base model, method, hyperparameters)
6. Run pre-flight check (Python, PyTorch, CUDA, GPU, VRAM, deps, disk, dataset, model)
7. Launch training (P1: actual execution; P0: launch-ready with DRAFT status)
8. Evaluate checkpoints against benchmarks
9. Compare base model vs. candidate
10. Promote in Model Registry (EXPERIMENT -> CANDIDATE -> ACCEPTED)
```

## Future Methods (Phase 2+)

### DPO (Direct Preference Optimization)
- Trains on chosen/rejected response pairs
- Good for: alignment, quality improvement, preference learning
- Extension point: clean interface in Training Center

### GRPO (Group Relative Policy Optimization)
- Reinforcement learning with verifiable rewards
- Good for: tasks with objective correctness (math, code, structured output)
- Extension point: clean interface in Training Center

### Continued Pretraining
- Further pretraining on domain-specific text
- Good for: domain adaptation (medical, legal, technical)
- Extension point: clean interface in Training Center

## Pre-Flight Check

Before any training launch, the system performs REAL environment checks:

| Check | What it verifies | How |
|-------|-----------------|-----|
| Python | Version >= 3.10 | `sys.version_info` |
| PyTorch | Importable + version | `import torch` |
| CUDA | Available | `torch.cuda.is_available()` |
| GPU | Device count + name | `torch.cuda.device_count()`, `get_device_name()` |
| VRAM | Free memory >= 4GB | `torch.cuda.mem_get_info()` |
| Transformers | Importable + version | `importlib.import_module("transformers")` |
| PEFT | Importable + version | `importlib.import_module("peft")` |
| TRL | Importable + version | `importlib.import_module("trl")` |
| Disk | Free space >= 10GB | `psutil.disk_usage()` |
| Dataset | File exists + valid JSONL | Parse each line as JSON |
| Base Model | Local path or HF Hub | `os.path.exists()` or `requests.head()` |

The check runs in the Python trainer service (port 8100) and is proxied through the Next.js API. If any critical check is NOT_READY, the UI displays "ENVIRONMENT NOT READY" with an explanation.
