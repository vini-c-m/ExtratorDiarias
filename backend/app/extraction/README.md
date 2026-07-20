# extraction/

Leitura de PDF e parsing do layout do SEI — não decide se um campo é válido, isso é responsabilidade do domain.

- `pdf_reader.py` — abre o PDF e extrai texto (pdfplumber, com PyMuPDF como reforço)
- `parsers/` — Strategy Pattern: `base_parser.py`, `sei_parser_v1.py`, `parser_factory.py`. Um novo layout do SEI vira um novo parser, sem alterar o resto do sistema.
