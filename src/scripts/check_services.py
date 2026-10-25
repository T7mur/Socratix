"""Read-only local signup prerequisites. Prints no credentials or provider bodies."""
import asyncio
import json

import httpx
from _common import ROOT, configure_event_loop, settings
from app.db.session import check_connection, create_database, dispose_database
from dotenv import dotenv_values


async def main():
    values = {**dotenv_values(ROOT / ".env"), **dotenv_values(ROOT / "src/frontend/.env.local")}
    report = {"frontend_configuration": {
        key: bool(values.get(key)) for key in ["NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SITE_URL", "API_BASE_URL"]}}
    try:
        config = settings()
    except Exception:
        report["database"] = {"connected": False, "error": "invalid_configuration"}
        print(json.dumps(report))
        return
    origin = values.get("NEXT_PUBLIC_SUPABASE_URL")
    report["auth_projects_match"] = origin == config.supabase_url
    async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
        try:
            response = await client.get(config.supabase_url + "/auth/v1/settings",
                headers={"apikey": values.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") or ""})
            if response.status_code == 200:
                data = response.json()
                report["auth"] = {"reachable": True, "signup_disabled": data.get("disable_signup"),
                    "email_enabled": data.get("external", {}).get("email"),
                    "email_autoconfirm": data.get("mailer_autoconfirm")}
            else:
                report["auth"] = {"reachable": True, "http_status": response.status_code}
            response = await client.get(config.jwks_url)
            report["jwks"] = {"http_status": response.status_code,
                "configured_algorithm_available": any(k.get("alg") == config.supabase_jwt_algorithm
                    for k in response.json().get("keys", [])) if response.status_code == 200 else False}
        except Exception:
            report["auth"] = {"reachable": False, "error": "network_or_response_failure"}
    database = create_database(config)
    try:
        report["database"] = await check_connection(database)
    except Exception:
        report["database"] = {"connected": False, "error": "connection_or_schema_failure"}
    finally:
        await dispose_database(database)
    print(json.dumps(report))


if __name__ == "__main__":
    configure_event_loop()
    asyncio.run(main())
