"""
NexusMCP Python Client
Lightweight HTTP client to communicate with the NexusMCP gateway.
"""

import json
import urllib.request
import urllib.error
from typing import Dict, Any, List, Optional


class NexusClient:
    """Client for invoking self-healing tools through a NexusMCP gateway instance."""

    def __init__(self, base_url: str = "http://localhost:8080", api_key: Optional[str] = None, timeout: int = 30):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout

    def _request(self, path: str, method: str = "GET", data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        url = f"{self.base_url}{path}"
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "NexusMCP-Python/0.2.0"
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        body = json.dumps(data).encode("utf-8") if data else None
        req = urllib.request.Request(url, data=body, headers=headers, method=method)

        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as response:
                resp_data = response.read().decode("utf-8")
                return json.loads(resp_data)
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8")
            try:
                return json.loads(err_body)
            except Exception:
                raise RuntimeError(f"NexusMCP HTTP {e.code}: {err_body}")
        except Exception as e:
            raise RuntimeError(f"NexusMCP connection failed to {url}: {str(e)}")

    def list_tools(self) -> List[Dict[str, Any]]:
        """Fetches the list of all available self-healing tools."""
        res = self._request("/tools", method="GET")
        return res.get("tools", [])

    def invoke_tool(self, name: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Invokes a tool via the self-healing and token-compressing gateway pipeline."""
        payload = {
            "name": name,
            "arguments": params or {}
        }
        return self._request("/invoke", method="POST", data=payload)

    def get_metrics(self) -> Dict[str, Any]:
        """Fetches current token savings and ROI stats."""
        return self._request("/metrics", method="GET")
