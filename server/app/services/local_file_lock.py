"""Exclusive file lock for local JSON read/write (Unix). No-op on Windows."""
import contextlib
import os
import sys


@contextlib.contextmanager
def local_file_lock(path: str):
    if sys.platform == "win32":
        yield
        return
    import fcntl

    directory = os.path.dirname(path)
    if directory:
        os.makedirs(directory, exist_ok=True)
    lock_path = path + ".lock"
    with open(lock_path, "a+", encoding="utf-8") as lf:
        fcntl.flock(lf.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lf.fileno(), fcntl.LOCK_UN)
