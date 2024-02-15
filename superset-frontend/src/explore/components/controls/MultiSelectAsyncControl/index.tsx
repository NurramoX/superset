/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import React, { useEffect, useState } from 'react';
import { SupersetClient, t } from '@superset-ui/core';
import ControlHeader from 'src/explore/components/ControlHeader';
import { Select } from 'src/components';
import { SelectOptionsType, SelectProps } from 'src/components/Select/types';
import { LabeledValue, SelectValue } from 'antd/lib/select';
import withToasts from 'src/components/MessageToasts/withToasts';
import { getClientErrorObject } from 'src/utils/getClientErrorObject';

type SelectAsyncProps = Omit<SelectProps, 'options' | 'ariaLabel' | 'onChange'>;

interface SelectAsyncControlProps extends SelectAsyncProps {
  addDangerToast: (error: string) => void;
  ariaLabel?: string;
  dataEndpoint: string;
  default?: SelectValue;
  mutator?: (response: Record<string, any>) => SelectOptionsType;
  multi?: boolean;
  onChange: (val: SelectValue) => void;
  // ControlHeader related props
  description?: string;
  hovered?: boolean;
  label?: string;
}

function isLabeledValue(arg: any): arg is LabeledValue {
  return arg.value !== undefined;
}

const SelectAsyncControl = ({
  addDangerToast,
  allowClear = true,
  ariaLabel,
  dataEndpoint,
  multi = true,
  mutator,
  onChange,
  placeholder,
  value,
  ...props
}: SelectAsyncControlProps) => {
  const [options, setOptions] = useState<SelectOptionsType>([]);
  const [optionMap, setOptionMap] = useState<Map<number, number>>(new Map());
  const [commonColumns, setCommonColumns] = useState<SelectOptionsType>([]);

  const handleOnChange = (val: SelectValue) => {
    let onChangeVal = val;
    if (Array.isArray(val)) {
      onChangeVal = val.map(v => (isLabeledValue(v) ? v.value : v));
    }
    if (isLabeledValue(val)) {
      onChangeVal = val.value;
    }
    onChange([{ ...value[0], val: onChangeVal }]);
  };

  const handleOnColChange = (val: SelectValue) => {
    onChange([{ val: value[0].val.slice(), col: val }]);
  };

  const getDeckSlices = () => {
    if (value === undefined || value.length < 1) return;
    const currentValue =
      value[0].val ||
      (props.default[0].val !== undefined ? props.default[0].val : undefined);

    // safety check - the value is intended to be undefined but null was used
    if (currentValue === null && !options.find(o => o.value[0].val === null)) {
      return undefined;
    }
    return currentValue;
  };

  const getCol = () => {
    if (value === undefined || value.length < 1) return;
    const currentValue =
      value[0].col ||
      (props.default[0].col !== undefined ? props.default[0].col : undefined);

    // safety check - the value is intended to be undefined but null was used
    if (currentValue === null && !options.find(o => o.value[0].col === null)) {
      return undefined;
    }
    return currentValue;
  };

  useEffect(() => {
    const onError = (response: Response) =>
      getClientErrorObject(response).then(e => {
        const { error } = e;
        addDangerToast(t('Error while fetching data: %s', error));
      });
    const loadOptions = () =>
      SupersetClient.get({
        endpoint: dataEndpoint,
      })
        .then(response => {
          const data = mutator ? mutator(response.json) : response.json.result;
          const newMap = new Map();
          data.forEach(
            ({ value, datasource }: { value: number; datasource: number }) => {
              newMap.set(value, datasource);
            },
          );
          setOptionMap(newMap);
          setOptions(data);
        })
        .catch(onError);
    loadOptions();
  }, [addDangerToast, dataEndpoint, mutator]);

  function handleBlur() {
    const onError = (response: Response) =>
      getClientErrorObject(response).then(e => {
        const { error } = e;
        addDangerToast(t('Error while fetching data: %s', error));
      });
    const loadOptions = () => {
      if (value === undefined || value.length < 1) return;
      const currentValue =
        value[0].val ||
        (props.default[0] !== undefined ? props.default[0] : undefined);
      let sanitizedValue: number[] = [];
      if (Array.isArray(currentValue)) {
        // @ts-ignore
        sanitizedValue = currentValue.map(v =>
          isLabeledValue(v) ? v.value : v,
        );
      }
      Promise.all(
        sanitizedValue.map(id =>
          SupersetClient.get({
            endpoint: `/api/v1/dataset/${optionMap.get(id)}`,
          }),
        ),
      )
        .then(responses => {
          const datasets = responses.map(response =>
            response.json.result.columns.map(column => column.column_name),
          );
          if (!datasets.length) return [];

          // Find the shortest array
          const [shortestArray] = datasets.sort((a, b) => a.length - b.length);

          // Find intersection
          const intersection = shortestArray.filter(item =>
            datasets.every(array => array.includes(item)),
          );
          let i = 0;
          setCommonColumns(
            intersection.map(val => ({
              value: val,
            })),
          );
          // return intersection;
        })
        .catch(onError);
    };
    loadOptions();
  }

  return (
    <>
      <Select
        allowClear={allowClear}
        ariaLabel={ariaLabel || t('Select ...')}
        value={getDeckSlices()}
        header={<ControlHeader {...props} />}
        onBlur={handleBlur}
        mode={multi ? 'multiple' : 'single'}
        onChange={handleOnChange}
        options={options}
        placeholder={placeholder}
      />

      <Select
        value={getCol()}
        options={commonColumns}
        onChange={handleOnColChange}
        header={<ControlHeader label="Select Col" />}
      />
    </>
  );
};

export default withToasts(SelectAsyncControl);
