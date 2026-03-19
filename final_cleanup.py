import os
import shutil

# 1. Update rooms.js with rooms_final.js content
src = r"d:\Downloads D\Web Chồn Village\web Test\rooms_final.js"
dst = r"d:\Downloads D\Web Chồn Village\web Test\rooms.js"

if os.path.exists(src):
    shutil.copy2(src, dst)
    print(f"Copied {src} to {dst}")

# 2. Cleanup
to_delete = [
    r"d:\Downloads D\Web Chồn Village\web Test\rooms_final.js",
    r"d:\Downloads D\Web Chồn Village\web Test\js_new",
    r"d:\Downloads D\Web Chồn Village\web Test\cleanup_rooms.py"
]

for p in to_delete:
    if os.path.exists(p):
        if os.path.isdir(p):
            shutil.rmtree(p)
        else:
            os.remove(p)
        print(f"Deleted {p}")
