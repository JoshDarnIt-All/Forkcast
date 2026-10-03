from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class ApiError(Exception):
    def __init__(self, status: int, detail: str, code: str):
        self.status, self.detail, self.code = status, detail, code


def install(app: FastAPI):
    @app.exception_handler(ApiError)
    async def _api(_: Request, e: ApiError):
        return JSONResponse({"detail": e.detail, "code": e.code}, status_code=e.status)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, e: StarletteHTTPException):
        code = {404: "not_found", 401: "unauthorized", 405: "method_not_allowed"}.get(e.status_code, "error")
        return JSONResponse({"detail": str(e.detail), "code": code}, status_code=e.status_code)

    @app.exception_handler(RequestValidationError)
    async def _val(_: Request, e: RequestValidationError):
        msg = "; ".join(f"{'.'.join(str(x) for x in err['loc'][1:])}: {err['msg']}" for err in e.errors())
        return JSONResponse({"detail": f"Invalid request: {msg}", "code": "validation_error"}, status_code=422)
