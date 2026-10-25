"""Start the local API with a Windows-compatible PostgreSQL event loop."""
import uvicorn
from _common import configure_event_loop

if __name__ == "__main__":
    configure_event_loop()
    uvicorn.run("app.main:create_configured_app", factory=True, host="127.0.0.1", port=8000, loop="asyncio")
