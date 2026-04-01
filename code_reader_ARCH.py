import os
import tkinter as tk
from tkinter import ttk, messagebox

current_path = os.getcwd()
selected_items = set()
dark_mode = True

# 🎨 ثيمات
def apply_theme():
    bg = "#1e1e1e" if dark_mode else "#ffffff"
    fg = "#ffffff" if dark_mode else "#000000"
    btn_bg = "#2d2d2d" if dark_mode else "#f0f0f0"
    btn_fg = "#ffffff" if dark_mode else "#000000"

    root.configure(bg=bg)
    path_label.configure(background=bg, foreground=fg)

    style.configure("TFrame", background=bg)
    style.configure("TLabel", background=bg, foreground=fg)
    style.configure("TButton", background=btn_bg, foreground=btn_fg)
    style.configure("TCheckbutton", background=bg, foreground=fg)
    style.configure("TScrollbar", background=btn_bg, troughcolor=bg)

# 📂 عرض الملفات
def list_dir(path):
    try:
        return os.listdir(path)
    except:
        return []

def show_items():
    for widget in frame.winfo_children():
        widget.destroy()

    path_label.config(text=f"📂 {current_path}")

    if os.path.dirname(current_path) != current_path:
        ttk.Button(frame, text="⬅ رجوع", command=go_back).pack(anchor="w", pady=5)

    for item in list_dir(current_path):
        full_path = os.path.join(current_path, item)

        row = ttk.Frame(frame)
        row.pack(fill="x", padx=5, pady=2)

        var = tk.BooleanVar(value=full_path in selected_items)

        def toggle(p=full_path, v=var):
            if v.get():
                selected_items.add(p)
            else:
                selected_items.discard(p)

        check = ttk.Checkbutton(row, variable=var, command=toggle)
        check.pack(side="left")

        if os.path.isdir(full_path):
            btn = ttk.Button(row, text=f"📁 {item}", command=lambda p=full_path: open_folder(p))
        else:
            btn = ttk.Label(row, text=f"📄 {item}", anchor="w")

        btn.pack(side="left", padx=5, fill="x")

# 📂 فتح فولدر
def open_folder(path):
    global current_path
    current_path = path
    show_items()

# ⬅ رجوع
def go_back():
    global current_path
    current_path = os.path.dirname(current_path)
    show_items()

# 📖 قراءة ملف
def read_file(file_path):
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()
    except:
        return "⚠️ لا يمكن قراءة الملف"

# 📋 تجميع المحتوى
def collect_content():
    result = ""

    for item in selected_items:
        if os.path.isfile(item):
            result += f"{os.path.basename(item)}\n"
            result += "-" * 20 + "\n"
            result += read_file(item) + "\n"
            result += "-" * 20 + "\n\n"

        elif os.path.isdir(item):
            for root_dir, _, files in os.walk(item):
                for file in files:
                    full_path = os.path.join(root_dir, file)
                    result += f"{file}\n"
                    result += "-" * 20 + "\n"
                    result += read_file(full_path) + "\n"
                    result += "-" * 20 + "\n\n"

    with open("output.txt", "w", encoding="utf-8") as f:
        f.write(result)

    messagebox.showinfo("تم", "تم حفظ المحتوى في output.txt")

# 🌙 تبديل الثيم
def toggle_theme():
    global dark_mode
    dark_mode = not dark_mode
    apply_theme()
    show_items()

# 🖱️ سكرول بالماوس
def on_mouse_wheel(event):
    canvas.yview_scroll(int(-1*(event.delta/120)), "units")

# 🗂️ إظهار الهيكل فقط
def show_structure():
    structure = ""
    for item in selected_items:
        if os.path.isfile(item):
            structure += f"📄 {os.path.basename(item)}\n"
        elif os.path.isdir(item):
            for root_dir, dirs, files in os.walk(item):
                level = root_dir.replace(item, "").count(os.sep)
                indent = "    " * level
                structure += f"{indent}📁 {os.path.basename(root_dir)}\n"
                for f_name in files:
                    structure += f"{indent}    📄 {f_name}\n"

    with open("structure.txt", "w", encoding="utf-8") as f:
        f.write(structure)

    messagebox.showinfo("تم", "تم حفظ الهيكل في structure.txt")

# 🔢 حساب عدد السطور والأحرف
def count_lines_chars():
    total_lines = 0
    total_chars = 0

    for item in selected_items:
        if os.path.isfile(item):
            content = read_file(item)
            total_lines += content.count("\n") + 1
            total_chars += len(content)
        elif os.path.isdir(item):
            for root_dir, _, files in os.walk(item):
                for file in files:
                    full_path = os.path.join(root_dir, file)
                    content = read_file(full_path)
                    total_lines += content.count("\n") + 1
                    total_chars += len(content)

    messagebox.showinfo("إحصائيات", f"عدد السطور: {total_lines}\nعدد الأحرف: {total_chars}")

# 🖥️ الواجهة
root = tk.Tk()
root.title("🔥 File Explorer Pro")
root.geometry("650x550")

style = ttk.Style()

path_label = ttk.Label(root, text="", font=("Arial", 11, "bold"))
path_label.pack(pady=5)

canvas = tk.Canvas(root, highlightthickness=0)
scrollbar = ttk.Scrollbar(root, orient="vertical", command=canvas.yview)

frame = ttk.Frame(canvas)

frame.bind(
    "<Configure>",
    lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
)

canvas.create_window((0, 0), window=frame, anchor="nw")
canvas.configure(yscrollcommand=scrollbar.set)

canvas.pack(side="left", fill="both", expand=True)
scrollbar.pack(side="right", fill="y")

# ربط السكرول بالماوس
canvas.bind_all("<MouseWheel>", on_mouse_wheel)

# أزرار تحت
bottom_frame = ttk.Frame(root)
bottom_frame.pack(pady=10)

ttk.Button(bottom_frame, text="📋 نسخ المحتوى", command=collect_content).pack(side="left", padx=5)
ttk.Button(bottom_frame, text="📁 عرض الهيكل", command=show_structure).pack(side="left", padx=5)
ttk.Button(bottom_frame, text="🔢 إحصائيات", command=count_lines_chars).pack(side="left", padx=5)
ttk.Button(bottom_frame, text="🌙 تبديل الوضع", command=toggle_theme).pack(side="left", padx=5)

# تشغيل
apply_theme()
show_items()

root.mainloop()