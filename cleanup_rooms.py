import os
import shutil

dirs_to_clean = [
    r"d:\Downloads D\Web Chồn Village\web Test\rooms.js",
    r"d:\Downloads D\Web Chồn Village\web Test\js_new"
]

for p in dirs_to_clean:
    if os.path.exists(p):
        if os.path.isdir(p):
            shutil.rmtree(p)
            print(f"Deleted directory: {p}")
        else:
            os.remove(p)
            print(f"Deleted file: {p}")
    else:
        print(f"Path not found: {p}")
