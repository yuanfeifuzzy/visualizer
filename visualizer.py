#!/usr/bin/env python
# -*- coding: utf-8 -*-

from pathlib import Path

import pandas as pd


def visualizer(tsv, outname):
    tsv = Path(tsv)
    table = f'{outname}.tsv.gz'
    df = pd.read_csv(tsv, sep='\t')
    df = df.drop(columns=[c for c in df.columns if '_bar_' in c or 'cbv_ratio' in c])
    df.columns = df.columns.str.replace('AC_zscore_n_', 'zscore_')
    df.to_csv(table, sep='\t', index=False)
    
    html = f'{outname}.html'
    with open('index.html') as f, open(html, 'w', encoding='utf-8') as o:
        o.write(f.read().replace('data.tsv.gz', table))
        
        
if __name__ == '__main__':
    data = '/Users/fuzzy/Projects/enrichment/09232025_LH00776_0029_A22CW55LT1/data'
    visualizer(f'{data}/Ova.vs.Ova-A.vs.Ova-A_RA127500.vs.F-beta.vs.Ova-F-beta.vs.A-Ova-F-beta.vs.NTC.tsv',
               'Ovastacin-Fetuin-10022025')
    visualizer(f'{data}/PSA-A_0.2uM.vs.PSA-Z_1uM.vs.PSA-A_1uM.vs.PSA-A_1uM-Inh.vs.NTC.tsv', 'PSA-10022025')