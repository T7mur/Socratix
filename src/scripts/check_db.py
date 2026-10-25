import asyncio
import json

from _common import configure_event_loop, settings
from app.db.session import check_connection, create_database, dispose_database


async def main():
    database = create_database(settings())
    try:
        print(json.dumps(await check_connection(database)))
    finally:
        await dispose_database(database)


if __name__ == "__main__":
    configure_event_loop()
    asyncio.run(main())
