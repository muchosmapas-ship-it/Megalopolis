"""
Servidor HTTP multi-hilo con charset=utf-8 en Content-Type
Soporta peticiones concurrentes para tiles, GeoJSON y Streaming 206 Range para Video MP4.
"""
import http.server
import os
import sys
import re

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8005
DIR = os.path.dirname(os.path.abspath(__file__))
VIDEO_PATH = r"F:\INYDES\Vuelos\Normal\video subir\DJI_20260914150859_0257_D.MP4"

class UTF8Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        if self.path.endswith(('.html', '.js', '.css', '.json', '.geojson', '.txt')):
            self._charset_added = True
        super().end_headers()

    def do_GET(self):
        # Alias directo para el video de vuelo local DJI
        clean_path = self.path.split('?')[0]
        if clean_path in ['/data/video.mp4', '/video.mp4', '/dji_video.mp4'] and os.path.exists(VIDEO_PATH):
            self.serve_video_file(VIDEO_PATH)
            return
        
        super().do_GET()

    def serve_video_file(self, video_file_path):
        try:
            file_size = os.path.getsize(video_file_path)
            range_header = self.headers.get('Range', None)

            if range_header:
                match = re.search(r'bytes=(\d+)-(\d*)', range_header)
                if match:
                    start = int(match.group(1))
                    end = int(match.group(2)) if match.group(2) else file_size - 1
                    end = min(end, file_size - 1)
                    length = end - start + 1

                    self.send_response(206)
                    self.send_header('Content-Type', 'video/mp4')
                    self.send_header('Content-Range', f'bytes {start}-{end}/{file_size}')
                    self.send_header('Content-Length', str(length))
                    self.send_header('Accept-Ranges', 'bytes')
                    self.end_headers()

                    with open(video_file_path, 'rb') as f:
                        f.seek(start)
                        chunk_size = 64 * 1024
                        bytes_left = length
                        while bytes_left > 0:
                            chunk = f.read(min(chunk_size, bytes_left))
                            if not chunk:
                                break
                            self.wfile.write(chunk)
                            bytes_left -= len(chunk)
                    return

            self.send_response(200)
            self.send_header('Content-Type', 'video/mp4')
            self.send_header('Content-Length', str(file_size))
            self.send_header('Accept-Ranges', 'bytes')
            self.end_headers()

            with open(video_file_path, 'rb') as f:
                chunk_size = 64 * 1024
                while True:
                    chunk = f.read(chunk_size)
                    if not chunk:
                        break
                    self.wfile.write(chunk)

        except (ConnectionResetError, BrokenPipeError):
            pass
        except Exception as e:
            print("Error sirviendo video:", e)

    def guess_type(self, path):
        result = super().guess_type(path)
        if path.endswith(('.html', '.js', '.css', '.json', '.geojson', '.txt', '.xml')):
            if result.startswith('text/'):
                return result + '; charset=utf-8'
            return 'text/plain; charset=utf-8'
        return result

    def log_message(self, format, *args):
        if len(args) >= 2 and str(args[1]) == '404' and '/tiles/' in str(args[0]):
            return
        super().log_message(format, *args)

os.chdir(DIR)
http.server.ThreadingHTTPServer.allow_reuse_address = True
print(f"Serving {DIR} at http://127.0.0.1:{PORT}/ (multithreaded + video streaming)")
with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), UTF8Handler) as httpd:
    httpd.serve_forever()
