#!/usr/bin/env python3
import json
import sys
from pathlib import Path
from typing import Optional

def _default_result_path() -> Path:
    script_path = Path(__file__).resolve()
    repo_root = script_path.parents[4] if len(script_path.parents) >= 5 else Path.cwd()
    return repo_root / "texts" / "result.json"


def save_result_json(job_id: str, text: str, result_path: Optional[Path] = None) -> Path:
    result_path = result_path or _default_result_path()
    result_path.parent.mkdir(parents=True, exist_ok=True)

    data = {}
    if result_path.exists():
        try:
            loaded = json.loads(result_path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                data = loaded
        except Exception:
            data = {}

    data[str(job_id)] = str(text)
    # data.pop("jobId", None)  <-- 삭제하지 않고 유지하거나, 업데이트해야 함
    # data.pop("text", None)
    
    # 서버가 완료를 감지할 수 있도록 현재 job 정보를 최상위에 업데이트
    data["jobId"] = str(job_id)
    data["text"] = str(text)
    result_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return result_path


def main(argv) -> int:
    if len(argv) < 2:
        print("usage: save_result_json.py <jobId> [result.json]", file=sys.stderr)
        print("       save_result_json.py <result.json> <jobId>", file=sys.stderr)
        return 1

    job_id = argv[1]
    if len(argv) >= 3:
        arg1 = argv[1]
        arg2 = argv[2]
        if Path(arg1).suffix.lower() == ".json":
            result_path = Path(arg1)
            job_id = arg2
        else:
            result_path = Path(arg2)
            job_id = arg1
    else:
        result_path = _default_result_path()

    text = sys.stdin.read()
    saved_path = save_result_json(job_id=job_id, text=text, result_path=result_path)
    print(f"Saved result to: {saved_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
