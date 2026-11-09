import csv,importlib.util,io,pathlib,tempfile,unittest
spec=importlib.util.spec_from_file_location('courses',pathlib.Path(__file__).parents[1]/'scripts/prepare-courses.py')
courses=importlib.util.module_from_spec(spec);spec.loader.exec_module(courses)

class CourseImportTest(unittest.TestCase):
    def row(self,**patch):
        return dict(CO_CURSO='123',NO_CURSO='Engenharia De Computação',CO_IES='150',CO_CINE_ROTULO='"0714E04"',NO_CINE_ROTULO='Engenharia de computação',CO_CINE_AREA_GERAL='07',NO_CINE_AREA_GERAL='Engenharia, produção e construção',CO_CINE_AREA_ESPECIFICA='071',NO_CINE_AREA_ESPECIFICA='Engenharia e profissões correlatas',CO_CINE_AREA_DETALHADA='0714',NO_CINE_AREA_DETALHADA='Eletrônica e automação',TP_GRAU_ACADEMICO='1',TP_NIVEL_ACADEMICO='1',TP_MODALIDADE_ENSINO='1',NU_ANO_CENSO='2024',TP_DIMENSAO='1')|patch
    def read(self,rows,encoding='cp1252',known=None):
        buffer=io.StringIO();writer=csv.DictWriter(buffer,fieldnames=courses.COLUMNS+['QT_MATRICULAS'],delimiter=';');writer.writeheader()
        writer.writerows(dict(r,QT_MATRICULAS='999999') for r in rows)
        raw=buffer.getvalue().encode(encoding)
        with tempfile.TemporaryDirectory(dir=pathlib.Path(__file__).parent) as directory:
            path=pathlib.Path(directory)/'courses.csv';path.write_bytes(raw)
            result=courses.prepare(path,{150,151} if known is None else known)
            self.assertEqual(path.read_bytes(),raw)
            return result
    def test_encoding_quotes_leading_zeros_and_sixteen_fields(self):
        catalog,cine,offers,report=self.read([self.row()])
        self.assertEqual(report['encoding'],'cp1252');self.assertEqual(len(report['columns']),16)
        self.assertEqual(cine[0][0],'0714E04');self.assertEqual(cine[0][2],'07');self.assertEqual(offers[0][3],'0714E04')
        self.assertNotIn('QT_MATRICULAS',report['columns']);self.assertEqual(catalog[0][1],'Engenharia De Computação')
    def test_utf8_detection(self):
        self.assertEqual(self.read([self.row()],encoding='utf-8')[3]['encoding'],'utf-8-sig')
    def test_geographic_rows_collapse_into_a_single_offering(self):
        rows=[self.row(TP_MODALIDADE_ENSINO='2',TP_DIMENSAO=dimension) for dimension in ['2','2','3','4']]
        catalog,cine,offers,report=self.read(rows)
        self.assertEqual(len(offers),1);self.assertEqual(offers[0][8],[2,3,4]);self.assertEqual(report['repeated_rows'],3)
    def test_official_code_conflicts_are_reported(self):
        report=self.read([self.row(),self.row(CO_IES='151')])[3]
        self.assertEqual(report['course_code_conflicts'],1)
    def test_same_formation_is_independent_of_institution(self):
        catalog,_,offers,_=self.read([self.row(),self.row(CO_CURSO='124',CO_IES='151')])
        self.assertEqual(len(catalog),1);self.assertEqual(len(offers),2);self.assertEqual(offers[0][2],offers[1][2])
    def test_same_cine_does_not_imply_equivalence(self):
        catalog,_,_,_=self.read([self.row(),self.row(CO_CURSO='124',NO_CURSO='Engenharia De Computação E Informação')])
        self.assertEqual(len(catalog),2)
    def test_homonyms_with_different_degrees_remain_separate(self):
        catalog,_,_,_=self.read([self.row(),self.row(CO_CURSO='124',TP_GRAU_ACADEMICO='3')])
        self.assertEqual(len(catalog),2)
    def test_reviewed_equivalence_is_narrow(self):
        catalog,_,offers,_=self.read([self.row(),self.row(CO_CURSO='124',NO_CURSO='Engenharia Da Computação'),self.row(CO_CURSO='125',NO_CURSO='Engenharia Da Computação',TP_GRAU_ACADEMICO='3')])
        self.assertEqual(len(catalog),2);self.assertEqual(offers[0][2],offers[1][2]);self.assertNotEqual(offers[0][2],offers[2][2])
        self.assertTrue(any('Eng. de Computação' in row[5] for row in catalog))
    def test_missing_institution_is_reported_without_creation(self):
        self.assertEqual(self.read([self.row()],known=set())[3]['missing_institutions'],[150])
    def test_invalid_hierarchy_is_rejected(self):
        self.assertEqual(len(self.read([self.row(CO_CINE_AREA_ESPECIFICA='999')])[3]['rejected']),1)
    def test_absent_cine_is_retained_as_absent(self):
        patch={k:'' for k in courses.COLUMNS if 'CINE' in k}
        catalog,cine,_,report=self.read([self.row(**patch)])
        self.assertIsNone(catalog[0][2]);self.assertEqual(cine,[]);self.assertEqual(report['courses_without_cine'],1)
    def test_identity_is_stable_and_does_not_depend_on_modality_or_year(self):
        self.assertEqual(courses.identity(' ENGENHÁRIA---de  Computação ','0714E04',1,1),courses.identity('Engenharia de Computação','0714E04',1,1))

if __name__=='__main__':unittest.main()
