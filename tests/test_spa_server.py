import importlib.util
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "spa_server.py"


class SpaServerTest(unittest.TestCase):
    def test_extensionless_route_falls_back_to_index_but_missing_asset_stays_404(self):
        spec = importlib.util.spec_from_file_location("spa_server", SCRIPT)
        assert spec is not None
        module = importlib.util.module_from_spec(spec)
        assert spec.loader
        spec.loader.exec_module(module)

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "index.html").write_text("SPA INDEX", encoding="utf-8")
            handler = module.create_handler(root)
            server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            base = f"http://127.0.0.1:{server.server_port}"
            try:
                self.assertEqual(urllib.request.urlopen(base + "/accounts-workloads").read(), b"SPA INDEX")
                request = urllib.request.Request(base + "/accounts-workloads", method="HEAD")
                self.assertEqual(urllib.request.urlopen(request).status, 200)
                with self.assertRaises(urllib.error.HTTPError) as missing:
                    urllib.request.urlopen(base + "/missing.js")
                self.assertEqual(missing.exception.code, 404)
            finally:
                server.shutdown()
                server.server_close()


if __name__ == "__main__":
    unittest.main()