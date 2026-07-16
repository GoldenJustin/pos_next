from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="pos_next",
    version="4.5.0",
    description="Modern Retail & Restaurant POS for ERPNext - tables, KDS, offline, premium receipts",
    long_description=long_description,
    long_description_content_type="text/markdown",
    author="POS Next Team",
    author_email="support@posnext.local",
    packages=find_packages(),
    include_package_data=True,
    zip_safe=False,
    # No install_requires to keep standalone and avoid uv resolver issue with frappe url deps
    install_requires=[],
    python_requires=">=3.10"
)
