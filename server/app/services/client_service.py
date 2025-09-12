import httpx

limits = httpx.Limits(max_connections=20, max_keepalive_connections=10)
client = httpx.AsyncClient(limits=limits, timeout=30.0)
