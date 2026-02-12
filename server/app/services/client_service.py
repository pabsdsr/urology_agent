import httpx

# Increase pool size to handle more concurrent requests
limits = httpx.Limits(max_connections=50, max_keepalive_connections=25)
client = httpx.AsyncClient(limits=limits, timeout=30.0)
