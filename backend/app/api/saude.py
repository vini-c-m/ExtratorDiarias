from fastapi import APIRouter

router = APIRouter(tags=["saude"])


@router.get("/health")
def checar_saude() -> dict[str, str]:
    return {"status": "ok"}
