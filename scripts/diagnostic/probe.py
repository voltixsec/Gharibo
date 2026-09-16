"""DEC-0037: one base-load diagnostic. No attached data or model execution."""
import json
import pathlib
import re
import traceback


def safe(text):
    return re.sub(r'hf_[A-Za-z0-9]+', '<redacted>', str(text))


def install():
    # Governed install source is injected unchanged by build-probe.mjs.
    __GOVERNED_INSTALL__


def main():
    phase = 'INPUT_ISOLATION'
    result = {'test_accessed': False, 'inference_executed': False,
              'install': False, 'tokenizer': False, 'model_load': False,
              'base_revision': None, 'status': 'BLOCKED'}
    try:
        # Inspect directory entries only; never open an input file.
        inputs = pathlib.Path('/kaggle/input')
        assert not inputs.exists() or not any(inputs.iterdir()), 'Attached input forbidden'
        phase = 'INSTALL'
        install()
        import importlib.metadata as metadata
        for dependency in PINS['engineDependencies']:
            expected = dependency['spec'].split('==', 1)[1]
            assert metadata.version(dependency['name']) == expected, dependency['name']
        result['install'] = True
        print('DIAGNOSTIC_INSTALL_PASS', flush=True)

        phase = 'BASE_REVISION'
        from huggingface_hub import HfApi
        api = HfApi()
        revision = api.model_info(PINS['baseModel']).sha
        assert revision == PINS['baseModelRevision'], 'Upstream base revision drift'
        result['base_revision'] = revision
        print('DIAGNOSTIC_BASE_REVISION_VERIFIED', revision, flush=True)
        # This verifies the governed upstream reference, not a weight equivalence proof
        # for the separately quantized Unsloth distribution. Print both identities.
        distribution = PINS['loaderModelId'] + '-unsloth-bnb-4bit'
        dist_info = api.model_info(distribution)
        result['distribution_revision'] = dist_info.sha
        print('DISTRIBUTION_IDENTITY', distribution, dist_info.sha, flush=True)
        # Separate metadata requests distinguish missing optional folder from download
        # errors. These are diagnostic observations, never load-path patches.
        for path in ('additional_chat_templates', ''):
            try:
                entries = list(api.list_repo_tree(distribution, path_in_repo=path,
                                                  revision=dist_info.sha))
                print('HUB_TREE', path or '<root>', 'OK', len(entries), flush=True)
            except Exception as exc:
                print('HUB_TREE', path or '<root>', type(exc).__name__, safe(exc), flush=True)

        phase = 'MODEL_TOKENIZER_LOAD'
        from unsloth import FastLanguageModel
        # Observe tokenizer/processor failures before Unsloth wraps the exception.
        from transformers import AutoTokenizer, AutoProcessor
        def observe(original, label):
            def load(*args, **kwargs):
                try:
                    obj = original(*args, **kwargs)
                    print('LOADER_COMPONENT_LOADED', label, type(obj).__name__, flush=True)
                    return obj
                except Exception:
                    print('LOADER_COMPONENT_TRACEBACK', label, safe(traceback.format_exc()), flush=True)
                    raise
            return load
        AutoTokenizer.from_pretrained = observe(AutoTokenizer.from_pretrained, 'AutoTokenizer')
        AutoProcessor.from_pretrained = observe(AutoProcessor.from_pretrained, 'AutoProcessor')
        model, tokenizer = FastLanguageModel.from_pretrained(
            model_name=PINS['loaderModelId'], max_seq_length=PINS['maxSeqLength'],
            dtype=None, load_in_4bit=True,
        )
        assert model is not None and tokenizer is not None
        result['model_load'] = True
        result['tokenizer'] = True
        result['model_class'] = type(model).__name__
        result['tokenizer_class'] = type(tokenizer).__name__
        result['loaded_model_id'] = str(model.config._name_or_path)
        result['loaded_model_revision'] = getattr(model.config, '_commit_hash', None)
        result['tokenizer_id'] = str(getattr(tokenizer, 'name_or_path', ''))
        print('DIAGNOSTIC_TOKENIZER_PASS', flush=True)
        print('DIAGNOSTIC_MODEL_LOAD_PASS', flush=True)
        phase = 'LOADED_IDENTITY'
        assert result['loaded_model_id'] in (PINS['loaderModelId'], distribution)
        assert result['loaded_model_revision'] == dist_info.sha, 'Distribution revision changed during load'
        assert result['tokenizer_id'] in (PINS['loaderModelId'], distribution)
        print('VERIFIED_IDENTITY', json.dumps(result, sort_keys=True), flush=True)
        result['status'] = 'PASS'
    except Exception as exc:
        result['failure_phase'] = phase
        result['exception'] = type(exc).__name__
        result['traceback'] = safe(traceback.format_exc())
        result['failure_class'] = ('TOKENIZER_PROCESSOR_LOAD' if 'tokenizer/processor' in str(exc)
                                   else phase)
        print('DIAGNOSTIC_TRACEBACK', result['traceback'], flush=True)
        raise
    finally:
        print('NO_TEST_ACCESSED', flush=True)
        print('NO_INFERENCE_EXECUTED', flush=True)
        pathlib.Path('/kaggle/working/diagnostic-result.json').write_text(
            json.dumps(result, indent=2), encoding='utf-8')
        if result['status'] == 'PASS':
            print('DIAGNOSTIC_COMPLETE', flush=True)


if __name__ == '__main__':
    main()
