import {describe,it,expect} from 'vitest';
import {baseApiFictive} from '../e2e/local/base-api-fictive';
describe('écritures navigateur limitées au banc fictif',()=>{
 it.each(['postgres://postgres:gerimmo-ci-local@127.0.0.1:5432/gerimmo_ci_sql_api','postgresql://postgres@127.0.0.1:55449/gerimmo_ci_finalisation_api'])('autorise le banc %s',url=>expect(()=>baseApiFictive(url)).not.toThrow());
 it.each([undefined,'postgres://postgres@production:5432/gerimmo_ci_sql_api','postgres://postgres@127.0.0.1:5432/production','postgres://postgres:secret@127.0.0.1:5432/gerimmo_ci_sql_api','postgres://postgres@127.0.0.1:5432/gerimmo_ci_sql_api?host=production'])('refuse %s',url=>expect(()=>baseApiFictive(url)).toThrow());
});
