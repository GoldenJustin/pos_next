from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="pos-next",
    version="2.0.0",
    description="Odoo-beating Super POS for ERPNext 15+",
    long_description=long_description,
    long_description_content_type="text/markdown",
    author="POS Next Team",
    packages=find_packages(),
    include_package_data=True,
    zip_safe=False,
    install_requires=["frappe>=15.0.0"]
)
