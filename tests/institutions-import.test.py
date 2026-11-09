import csv, importlib.util, io, pathlib, tempfile, unittest

spec = importlib.util.spec_from_file_location('prepare', pathlib.Path(__file__).parents[1] / 'scripts/prepare-institutions.py')
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)

class InstitutionImportTest(unittest.TestCase):
    def read(self, rows):
        buffer = io.StringIO()
        writer = csv.DictWriter(buffer, fieldnames=list(prepare.COLUMNS), delimiter=';')
        writer.writeheader()
        writer.writerows(rows)
        raw = buffer.getvalue().encode('cp1252')
        with tempfile.TemporaryDirectory(dir=pathlib.Path(__file__).parent) as directory:
            path = pathlib.Path(directory) / 'ies.csv'
            path.write_bytes(raw)
            result = prepare.prepare(path)
            self.assertEqual(path.read_bytes(), raw)
            return result

    def sample(self, **values):
        return dict(CO_IES='150', NO_IES='  UNIVERSIDADE DE SOROCABA ', SG_IES=' UNISO ', NO_MUNICIPIO_IES='Sorocaba', CO_MUNICIPIO_IES='3552205', SG_UF_IES='SP', TP_ORGANIZACAO_ACADEMICA='1', TP_CATEGORIA_ADMINISTRATIVA='5', TP_REDE='2', NU_ANO_CENSO='2024') | values

    def test_encoding_official_columns_and_empty_acronym(self):
        rows, report = self.read([self.sample(NO_IES='Instituição Árvore', SG_IES='  ')])
        self.assertEqual(rows[0]['nome'], 'Instituição Árvore')
        self.assertIsNone(rows[0]['sigla'])
        self.assertEqual(len(rows[0]), 10)
        self.assertEqual(report['without_acronym'], 1)
        self.assertEqual(report['encoding'], 'windows-1252')

    def test_duplicate_code_is_not_a_new_institution(self):
        rows, report = self.read([self.sample(), self.sample()])
        self.assertEqual(len(rows), 1)
        self.assertEqual(len(report['duplicates']), 1)
        self.assertEqual(report['conflicts'], [])

    def test_conflicts_and_invalid_classifications_are_reported(self):
        rows, report = self.read([self.sample(), self.sample(NO_IES='Nome conflitante'), self.sample(CO_IES='0'), self.sample(CO_IES='151', TP_CATEGORIA_ADMINISTRATIVA='9')])
        self.assertEqual(len(rows), 1)
        self.assertEqual(len(report['conflicts']), 1)
        self.assertEqual(len(report['rejected']), 2)

    def test_same_acronym_keeps_distinct_official_codes(self):
        rows, report = self.read([self.sample(SG_IES='UCP'), self.sample(CO_IES='151', NO_IES='Outra instituição', SG_IES='UCP')])
        self.assertEqual(len(rows), 2)
        self.assertEqual(report['duplicates'], [])

if __name__ == '__main__':
    unittest.main()
